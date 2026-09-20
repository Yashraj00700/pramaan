/**
 * Pramaan HTTP-layer hardening.
 *
 * Small, dependency-free helpers that sit in front of / around api/_core.ts's
 * `analyze()`:
 *   - validateRequest(): reject bad/oversized/unsupported uploads BEFORE we ever
 *     touch the Anthropic API, with a friendly, actionable error string.
 *   - toUserMessage(): turn any thrown error (Anthropic SDK, network, or ours)
 *     into a message that is safe to show a client — never the raw error,
 *     never the API key, never a stack trace or internal URL.
 *   - withRetry(): retry only genuinely transient failures (429 / 5xx /
 *     network / timeout) with exponential backoff + jitter; 4xx client
 *     errors (bad request, auth, validation) are never retried.
 *
 * Nothing here fabricates a verdict or a verification result — this file is
 * pure plumbing around the request/response boundary.
 */

// ---------------------------------------------------------------------------
// Upload limits
// ---------------------------------------------------------------------------

/** Max accepted decoded file size: 4 MiB. */
export const MAX_BYTES = 4 * 1024 * 1024;

/** MIME types Pramaan knows how to forensically examine. */
export const ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'application/pdf',
] as const;

export type AllowedMime = (typeof ALLOWED_MIME)[number];

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

export type ValidatedRequest = {
  ok: true;
  fileBase64: string;
  mediaType: string;
  fileName: string;
};

export type ValidationError = {
  ok: false;
  status: number;
  error: string;
};

/** Loose but effective check that a string is plausibly base64 (no path traversal, no control chars, etc). */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Given the raw, decoded byte length of a base64 payload, compute the size in MB
 * for human-friendly error messages.
 */
function bytesToMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

/**
 * Compute the decoded byte length of a base64 string WITHOUT allocating a
 * Buffer for it. This lets us reject an oversized upload cheaply, before we
 * ever pay the cost of decoding a multi-megabyte string into memory.
 *
 * Formula: for a base64 string of length n (no whitespace), decoded size is
 * floor(n * 3 / 4) minus 1 per trailing '=' padding character.
 */
function decodedByteLength(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (b64.endsWith('==')) padding = 2;
  else if (b64.endsWith('=')) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Sanitize a user-supplied file name: strip any path separators / traversal
 * sequences and control characters, then cap the length so it's safe to log
 * or echo back.
 */
function sanitizeFileName(raw: unknown): string {
  const fallback = 'document';
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  const stripped = raw
    .replace(/[\\/]/g, '_') // path separators
    .replace(/\.\./g, '_') // traversal sequences
    .replace(/[\x00-\x1f\x7f]/g, '') // control chars
    .trim();
  if (!stripped) return fallback;
  return stripped.slice(0, 200);
}

/**
 * Validate an incoming analyze-request body. Returns either the sanitized,
 * ready-to-use fields, or a `{ ok: false, status, error }` describing exactly
 * why the request was rejected (safe to send straight to the client).
 */
export function validateRequest(body: unknown): ValidatedRequest | ValidationError {
  if (!body || typeof body !== 'object') {
    return { ok: false, status: 400, error: 'Request body is missing or malformed. Please try uploading again.' };
  }

  const { fileBase64, mediaType, fileName } = body as {
    fileBase64?: unknown;
    mediaType?: unknown;
    fileName?: unknown;
  };

  if (typeof fileBase64 !== 'string' || fileBase64.length === 0) {
    return { ok: false, status: 400, error: 'No file was received. Please choose a file and try again.' };
  }

  // Base64 payloads may legitimately carry a data-URL prefix from some clients;
  // strip it defensively, then validate the remainder actually looks like base64.
  const commaIdx = fileBase64.indexOf(',');
  const rawB64 = fileBase64.startsWith('data:') && commaIdx !== -1 ? fileBase64.slice(commaIdx + 1) : fileBase64;
  const cleaned = rawB64.replace(/\s/g, '');

  if (cleaned.length === 0 || !BASE64_RE.test(cleaned)) {
    return { ok: false, status: 400, error: 'The uploaded file data is not valid. Please try uploading again.' };
  }

  const decodedSize = decodedByteLength(cleaned);
  if (decodedSize <= 0) {
    return { ok: false, status: 400, error: 'The uploaded file appears to be empty. Please choose a file and try again.' };
  }
  if (decodedSize > MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `File is too large (${bytesToMb(decodedSize)} MB). Please upload a file under ${bytesToMb(MAX_BYTES)} MB.`,
    };
  }

  if (typeof mediaType !== 'string' || !ALLOWED_MIME.includes(mediaType as AllowedMime)) {
    return {
      ok: false,
      status: 415,
      error: `Unsupported file type${typeof mediaType === 'string' && mediaType ? ` (${mediaType})` : ''}. Please upload a PNG, JPEG, WEBP, GIF, or PDF file.`,
    };
  }

  return {
    ok: true,
    fileBase64: cleaned,
    mediaType,
    fileName: sanitizeFileName(fileName),
  };
}

// ---------------------------------------------------------------------------
// Safe error → user message mapping
// ---------------------------------------------------------------------------

/**
 * Best-effort extraction of an HTTP-ish status code from an arbitrary thrown
 * error (Anthropic SDK errors expose `.status`; some fetch/network errors
 * expose `.status` or `.statusCode`; plain errors have neither).
 */
function extractStatus(err: unknown): number | undefined {
  const e = err as any;
  const candidates = [e?.status, e?.statusCode, e?.response?.status];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c)) return c;
  }
  return undefined;
}

function isTimeoutOrAbort(err: unknown): boolean {
  const e = err as any;
  const name = String(e?.name || '');
  const code = String(e?.code || '');
  const message = String(e?.message || '').toLowerCase();
  return (
    name === 'AbortError' ||
    name === 'APIConnectionTimeoutError' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED' ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  );
}

function isNetworkError(err: unknown): boolean {
  const e = err as any;
  const name = String(e?.name || '');
  const code = String(e?.code || '');
  const message = String(e?.message || '').toLowerCase();
  return (
    name === 'APIConnectionError' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    message.includes('fetch failed') ||
    message.includes('network')
  );
}

/**
 * Map ANY thrown error (Anthropic SDK error, fetch/network failure, or a
 * plain Error we raised ourselves) to a short, safe, user-facing message.
 *
 * Guarantees:
 *   - never includes the API key or any Authorization header value
 *   - never includes a raw stack trace
 *   - never includes an internal URL (api.anthropic.com request paths, etc.)
 * Callers are still responsible for logging the real error server-side
 * (console.error) — this function only decides what the CLIENT sees.
 */
export function toUserMessage(err: unknown): string {
  const status = extractStatus(err);

  if (status === 401 || status === 403) {
    return 'The server is not configured correctly (authentication problem with the analysis provider). Please contact the administrator.';
  }
  if (status === 429) {
    return 'Pramaan is receiving a lot of requests right now. Please wait a moment and try again.';
  }
  if (status === 413) {
    return 'File is too large. Please upload a smaller file.';
  }
  if (status === 400 || status === 422) {
    return 'The uploaded file could not be processed. Please check the file and try again.';
  }
  if (status !== undefined && status >= 500) {
    return 'The analysis service is temporarily unavailable. Please try again in a moment.';
  }

  const e: any = err;
  const overloaded =
    String(e?.error?.type || e?.type || '').includes('overloaded') ||
    String(e?.message || '').toLowerCase().includes('overloaded');
  if (overloaded) {
    return 'The analysis service is temporarily overloaded. Please try again in a moment.';
  }

  if (isTimeoutOrAbort(err)) {
    return 'The analysis took too long and timed out. Please try again — very large or complex documents may need a retry.';
  }
  if (isNetworkError(err)) {
    return 'Could not reach the analysis service due to a network issue. Please try again.';
  }

  // Generic, safe fallback — deliberately does not echo err.message, which
  // could contain provider request details.
  return 'Analysis failed. Please try again. If the problem persists, contact support.';
}

/**
 * Pick an HTTP status code to send back to OUR client for a given upstream
 * error — separate from toUserMessage's job of picking safe wording. We
 * deliberately do not forward the provider's 401/403 as-is (that would be
 * misleading: it is a problem with OUR server's key, not the caller's
 * request), and we cap everything else to a small, predictable set.
 */
export function statusForError(err: unknown): number {
  const status = extractStatus(err);
  if (status === 429) return 429;
  if (status === 413) return 413;
  if (status === 400 || status === 422) return 400;
  // Auth problems (401/403) are OUR server's misconfiguration, not the
  // caller's fault — surface as a generic server error, not as 401/403
  // (which would incorrectly suggest the caller needs to authenticate).
  return 502;
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff + jitter
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Max number of retries AFTER the initial attempt. Default 2 (so up to 3 attempts total). */
  maxRetries?: number;
  /** Base delay in ms for the first retry. Default 500. */
  baseDelayMs?: number;
  /** Upper bound on any single backoff delay, in ms. Default 8000. */
  maxDelayMs?: number;
  /** Override transience detection if the caller knows better. */
  isRetryable?: (err: unknown) => boolean;
  /** Injectable sleep, primarily for tests. */
  sleep?: (ms: number) => Promise<void>;
}

/** True only for failures worth retrying: 429, 5xx/overloaded, timeouts, and network errors. Never 4xx (other than 429). */
function defaultIsRetryable(err: unknown): boolean {
  const status = extractStatus(err);
  if (status === 429) return true;
  if (status !== undefined && status >= 500) return true;
  if (status !== undefined && status < 500) return false; // other 4xx: never retry

  const e: any = err;
  const overloaded =
    String(e?.error?.type || e?.type || '').includes('overloaded') ||
    String(e?.message || '').toLowerCase().includes('overloaded');
  if (overloaded) return true;

  return isTimeoutOrAbort(err) || isNetworkError(err);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a promise-returning function on transient failures only.
 * Uses exponential backoff (baseDelayMs * 2^attempt) with full jitter,
 * capped at maxDelayMs. Non-retryable errors (e.g. 4xx client errors other
 * than 429) are re-thrown immediately on the first failure.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxRetries = opts.maxRetries ?? 2;
  const baseDelayMs = opts.baseDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;
  const sleep = opts.sleep ?? defaultSleep;

  let attempt = 0;
  // attempt 0 = the initial try; attempts 1..maxRetries are retries.
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isRetryable(err)) {
        throw err;
      }
      const exp = baseDelayMs * Math.pow(2, attempt);
      const capped = Math.min(exp, maxDelayMs);
      const jittered = Math.random() * capped; // full jitter
      await sleep(jittered);
      attempt++;
    }
  }
}
