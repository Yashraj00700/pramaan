import type { VercelRequest, VercelResponse } from '@vercel/node';
import { analyze } from './_core';
import {
  validateRequest,
  toUserMessage,
  withRetry,
  statusForError,
  type ValidatedRequest,
  type ValidationError,
} from './_validate';

// Give Claude room to reason (deep analysis + optional web search). Matches vercel.json.
export const config = { maxDuration: 300 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate the request BEFORE we touch the analysis engine at all: reject
  // missing/oversized/unsupported uploads cheaply and with a friendly,
  // actionable message.
  // NOTE: explicit casts — this tsconfig does not enable `strict`, so TS will not
  // narrow the `ok: true | false` discriminant on its own.
  const validation = validateRequest(req.body);
  if (!validation.ok) {
    const failed = validation as ValidationError;
    return res.status(failed.status).json({ error: failed.error });
  }
  const { fileBase64, mediaType, fileName } = validation as ValidatedRequest;

  try {
    // Only transient failures (429 / 5xx / overloaded / network / timeout) are
    // retried; a 4xx from the provider fails fast on the first attempt.
    const report = await withRetry(() => analyze({ fileBase64, mediaType, fileName }));
    return res.status(200).json({ report });
  } catch (e: unknown) {
    // Log the real error server-side for debugging...
    console.error('analyze error:', e);
    // ...but never echo the raw error object (which may carry provider
    // internals, stack traces, or request URLs) back to the client.
    return res.status(statusForError(e)).json({ error: toUserMessage(e) });
  }
}
