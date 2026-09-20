/**
 * verification.ts
 * ----------------
 * Deterministic validation layer for Pramaan.
 *
 * This module makes ZERO external/network calls and does NO guessing. Every
 * validator below is a pure function that either mathematically proves a
 * number is malformed (checksum/format failure) or proves it is well-formed.
 * It never asserts authenticity of the underlying document, ownership of the
 * identifier, or anything a checksum cannot prove.
 *
 * Philosophy: Pramaan never fabricates verification. A checksum FAIL is real
 * proof of a bad number. A checksum PASS only proves the number is
 * structurally valid — not that it belongs to the document holder. Where we
 * cannot compute anything conclusive, we say so instead of inventing a
 * result.
 */

// ---------------------------------------------------------------------------
// Shared result / report shapes (kept structurally identical to types.ts so
// this module can be used interchangeably with the rest of the report).
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  reason: string;
}

export interface ConsistencyCheck {
  check: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

export interface TechnicalSignal {
  label: string;
  value: string;
  concern: boolean;
}

export interface ExtractedField {
  label: string;
  value: string;
}

export interface DeterministicChecksResult {
  checks: ConsistencyCheck[];
  signals: TechnicalSignal[];
  hardFailures: number;
}

// ===========================================================================
// Small shared helpers
// ===========================================================================

/** Strip all whitespace and make uppercase — the normal form we validate against. */
function clean(v: string): string {
  return (v ?? '').replace(/\s+/g, '').toUpperCase();
}

// ===========================================================================
// Verhoeff algorithm (used by Aadhaar checksum)
// ===========================================================================
// Reference tables for the Verhoeff checksum algorithm. These are fixed
// mathematical constants (not something to "guess") — see Verhoeff (1969).

// Multiplication table d[i][j]
const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

// Permutation table p[i][j]
const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

// Inverse table inv[i]
const VERHOEFF_INV: number[] = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

/**
 * Returns true if the given all-digit string passes the Verhoeff checksum
 * (i.e. the checksum digit — conventionally the LAST digit — makes the
 * running total land on 0).
 */
function verhoeffIsValid(numStr: string): boolean {
  let c = 0;
  const digits = numStr.split('').reverse().map((d) => parseInt(d, 10));
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
  }
  return c === 0;
}

// ===========================================================================
// validateAadhaar
// ===========================================================================

/**
 * Validates an Indian Aadhaar number:
 *  - exactly 12 digits
 *  - must not start with 0 or 1 (UIDAI never issues Aadhaar numbers starting
 *    with 0 or 1)
 *  - must pass the Verhoeff checksum
 */
export function validateAadhaar(v: string): ValidationResult {
  const s = clean(v).replace(/[^0-9]/g, '');
  const original = clean(v);

  if (original.replace(/[0-9]/g, '') !== '') {
    return { valid: false, reason: 'Aadhaar number must contain digits only.' };
  }
  if (s.length !== 12) {
    return {
      valid: false,
      reason: `Aadhaar number must be exactly 12 digits (found ${s.length}).`,
    };
  }
  if (s[0] === '0' || s[0] === '1') {
    return {
      valid: false,
      reason: 'Aadhaar numbers never start with 0 or 1 per UIDAI allocation rules.',
    };
  }
  if (!verhoeffIsValid(s)) {
    return {
      valid: false,
      reason: 'Aadhaar number fails the Verhoeff checksum — this is not a mathematically valid Aadhaar number.',
    };
  }
  return { valid: true, reason: 'Aadhaar number is 12 digits, does not start with 0/1, and passes the Verhoeff checksum.' };
}

// ===========================================================================
// validatePAN
// ===========================================================================

// 4th character of a PAN encodes the holder's entity type.
const PAN_ENTITY_TYPES: Record<string, string> = {
  P: 'Individual (Person)',
  C: 'Company',
  H: 'Hindu Undivided Family (HUF)',
  A: 'Association of Persons (AOP)',
  B: 'Body of Individuals (BOI)',
  G: 'Government',
  J: 'Artificial Juridical Person',
  L: 'Local Authority',
  F: 'Firm / Limited Liability Partnership',
  T: 'Trust',
};

/**
 * Validates an Indian PAN (Permanent Account Number):
 *  - format /^[A-Z]{5}[0-9]{4}[A-Z]$/
 *  - 4th character must be a recognised entity-type code
 */
export function validatePAN(v: string): ValidationResult {
  const s = clean(v);
  const formatRe = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

  if (!formatRe.test(s)) {
    return {
      valid: false,
      reason: 'PAN must match the format AAAAA9999A (5 letters, 4 digits, 1 letter).',
    };
  }

  const entityCode = s[3];
  const entityMeaning = PAN_ENTITY_TYPES[entityCode];
  if (!entityMeaning) {
    return {
      valid: false,
      reason: `4th character '${entityCode}' is not a recognised PAN entity-type code (expected one of P/C/H/A/B/G/J/L/F/T).`,
    };
  }

  return {
    valid: true,
    reason: `PAN format is valid; 4th character '${entityCode}' decodes to entity type: ${entityMeaning}.`,
  };
}

// ===========================================================================
// validateGSTIN
// ===========================================================================

// Valid GST state codes 01-38 (as allocated by the Indian Census/GSTN; not
// every number in the range is currently allotted to a state, but 01-38 is
// the valid numeric envelope used for format validation).
const GSTIN_VALID_STATE_CODES = new Set(
  Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, '0'))
);

// GSTIN checksum alphabet used for the mod-36 check digit.
const GSTIN_CHECKSUM_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Computes the GSTIN check digit (15th character) for the first 14
 * characters, using the published mod-36 algorithm:
 *  - each character -> numeric code (0-9 -> 0-9, A-Z -> 10-35)
 *  - alternating weights of 1 and 2 from the left (position 0 = weight 1)
 *  - each product's digits are summed (i.e. product mod 35, plus product div 35 — factor sum)
 *  - sum all "factor" values, take mod 36, the check char = (36 - (sum % 36)) % 36 mapped back through the alphabet
 */
function computeGstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < first14.length; i++) {
    const code = GSTIN_CHECKSUM_CHARS.indexOf(first14[i]);
    const weight = (i % 2 === 0) ? 1 : 2;
    const product = code * weight;
    const factor = Math.floor(product / 36) + (product % 36);
    sum += factor;
  }
  const checkCodeValue = (36 - (sum % 36)) % 36;
  return GSTIN_CHECKSUM_CHARS[checkCodeValue];
}

/**
 * Validates an Indian GSTIN (Goods and Services Tax Identification Number):
 *  - 15 characters
 *  - chars 1-2: valid state code 01-38
 *  - chars 3-12: a structurally valid PAN
 *  - char 15: must pass the GSTIN mod-36 checksum
 *  (char 13 is the registration-count digit 1-9/A-Z, char 14 is fixed 'Z' by
 *  convention but is not itself checksum-relevant, so we do not hard-fail on
 *  it — we only assert what we can mathematically prove.)
 */
export function validateGSTIN(v: string): ValidationResult {
  const s = clean(v);

  if (s.length !== 15) {
    return { valid: false, reason: `GSTIN must be exactly 15 characters (found ${s.length}).` };
  }
  if (!/^[0-9A-Z]{15}$/.test(s)) {
    return { valid: false, reason: 'GSTIN must contain only uppercase letters and digits.' };
  }

  const stateCode = s.slice(0, 2);
  if (!/^[0-9]{2}$/.test(stateCode) || !GSTIN_VALID_STATE_CODES.has(stateCode)) {
    return { valid: false, reason: `GSTIN state code '${stateCode}' is not a valid state code (expected 01-38).` };
  }

  const panPart = s.slice(2, 12);
  const panCheck = validatePAN(panPart);
  if (!panCheck.valid) {
    return { valid: false, reason: `Embedded PAN (chars 3-12: '${panPart}') is invalid: ${panCheck.reason}` };
  }

  const providedCheckDigit = s[14];
  const expectedCheckDigit = computeGstinCheckDigit(s.slice(0, 14));
  if (providedCheckDigit !== expectedCheckDigit) {
    return {
      valid: false,
      reason: `GSTIN checksum mismatch — expected check digit '${expectedCheckDigit}' but found '${providedCheckDigit}'. This is a mathematically invalid GSTIN.`,
    };
  }

  return {
    valid: true,
    reason: `GSTIN state code (${stateCode}), embedded PAN, and mod-36 checksum are all valid.`,
  };
}

// ===========================================================================
// validateIFSC
// ===========================================================================

/**
 * Validates an Indian IFSC (Indian Financial System Code):
 *  - format /^[A-Z]{4}0[A-Z0-9]{6}$/ — first 4 letters are the bank code,
 *    5th character MUST be the literal '0' (reserved by RBI for future use),
 *    last 6 are the branch code.
 */
export function validateIFSC(v: string): ValidationResult {
  const s = clean(v);
  const re = /^[A-Z]{4}0[A-Z0-9]{6}$/;

  if (s.length !== 11) {
    return { valid: false, reason: `IFSC must be exactly 11 characters (found ${s.length}).` };
  }
  if (!re.test(s)) {
    if (s[4] !== '0') {
      return {
        valid: false,
        reason: `IFSC 5th character must be '0' (reserved by RBI), found '${s[4]}'.`,
      };
    }
    return {
      valid: false,
      reason: 'IFSC must match the format AAAA0XXXXXX (4 letters, literal 0, 6 alphanumeric).',
    };
  }
  return {
    valid: true,
    reason: `IFSC format is valid — bank code '${s.slice(0, 4)}', branch code '${s.slice(5)}'.`,
  };
}

// ===========================================================================
// validateIBAN
// ===========================================================================

/**
 * Validates an IBAN (International Bank Account Number) via the standard
 * ISO 7064 MOD-97-10 algorithm:
 *  1. Move the first 4 characters to the end.
 *  2. Replace each letter with two digits (A=10, B=11, ..., Z=35).
 *  3. Interpret the result as a decimal integer and check mod 97 === 1.
 */
export function validateIBAN(v: string): ValidationResult {
  const s = clean(v);

  if (s.length < 15 || s.length > 34) {
    return { valid: false, reason: `IBAN length (${s.length}) is outside the valid range of 15-34 characters.` };
  }
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(s)) {
    return {
      valid: false,
      reason: 'IBAN must start with a 2-letter country code followed by 2 check digits, then alphanumeric BBAN.',
    };
  }

  const rearranged = s.slice(4) + s.slice(0, 4);

  let expanded = '';
  for (const ch of rearranged) {
    if (ch >= '0' && ch <= '9') {
      expanded += ch;
    } else if (ch >= 'A' && ch <= 'Z') {
      expanded += String(ch.charCodeAt(0) - 55); // A=10 ... Z=35
    } else {
      return { valid: false, reason: `IBAN contains an unexpected character '${ch}'.` };
    }
  }

  // mod-97 on a big numeric string done in chunks to avoid precision loss.
  let remainder = 0;
  for (let i = 0; i < expanded.length; i++) {
    remainder = (remainder * 10 + parseInt(expanded[i], 10)) % 97;
  }

  if (remainder !== 1) {
    return {
      valid: false,
      reason: 'IBAN fails the ISO 7064 MOD-97-10 checksum — this is not a mathematically valid IBAN.',
    };
  }

  return {
    valid: true,
    reason: `IBAN passes the MOD-97-10 checksum (country code '${s.slice(0, 2)}').`,
  };
}

// ===========================================================================
// validateUPI
// ===========================================================================

/**
 * Validates a UPI VPA (Virtual Payment Address), e.g. "name@bankhandle".
 * There is no public checksum for UPI IDs — this is a structural format
 * check only (handle 2-256 chars of alphanumeric/.-_, '@', then a bank/PSP
 * handle of letters). We are explicit that this is NOT proof the VPA is
 * live or owned by anyone in particular.
 */
export function validateUPI(v: string): ValidationResult {
  const s = (v ?? '').trim();
  const re = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.]{1,64}$/;

  if (!re.test(s)) {
    return {
      valid: false,
      reason: 'UPI ID does not match the expected format "handle@psp" (e.g. name@okhdfcbank).',
    };
  }
  return {
    valid: true,
    reason: 'UPI ID matches the standard "handle@psp" structural format. Note: format validity does not confirm the VPA is active or owned by the document holder — no live UPI directory lookup was performed.',
  };
}

// ===========================================================================
// validateIndianMobile
// ===========================================================================

/**
 * Validates an Indian mobile number: 10 digits, first digit 6-9 (the range
 * TRAI allocates for mobile numbers), optionally prefixed with +91/91/0.
 */
export function validateIndianMobile(v: string): ValidationResult {
  let s = clean(v).replace(/[^0-9+]/g, '');

  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);

  if (!/^[0-9]{10}$/.test(s)) {
    return {
      valid: false,
      reason: `Indian mobile number must be 10 digits after removing country/trunk prefix (found '${s}').`,
    };
  }
  if (!/^[6-9]/.test(s)) {
    return {
      valid: false,
      reason: `Indian mobile numbers must start with 6, 7, 8, or 9 (found leading digit '${s[0]}').`,
    };
  }
  return { valid: true, reason: 'Mobile number is 10 digits and starts with a valid TRAI-allocated leading digit (6-9).' };
}

// ===========================================================================
// validatePIN
// ===========================================================================

/**
 * Validates an Indian postal (PIN) code: 6 digits, first digit 1-8 (India
 * Post never issues a PIN code region starting with 0 or 9).
 */
export function validatePIN(v: string): ValidationResult {
  const s = clean(v).replace(/[^0-9]/g, '');

  if (s.length !== 6 || clean(v).replace(/[0-9]/g, '') !== '') {
    return { valid: false, reason: `PIN code must be exactly 6 digits (found '${clean(v)}').` };
  }
  if (!/^[1-8]/.test(s)) {
    return {
      valid: false,
      reason: `Indian PIN codes must start with a digit 1-8 (found leading digit '${s[0]}').`,
    };
  }
  return { valid: true, reason: 'PIN code is 6 digits with a valid leading region digit (1-8).' };
}

// ===========================================================================
// runDeterministicChecks
// ===========================================================================

/** Identifier kinds we know how to validate deterministically. */
type IdentifierKind =
  | 'aadhaar'
  | 'pan'
  | 'gstin'
  | 'ifsc'
  | 'iban'
  | 'upi'
  | 'mobile'
  | 'pin';

interface IdentifierMatch {
  kind: IdentifierKind;
  checkName: string;
}

/** Label keyword -> identifier kind. Checked against a lowercased label. */
const LABEL_HINTS: Array<{ re: RegExp; kind: IdentifierKind }> = [
  { re: /aadhaar|aadhar|uid(?!in)|uidai/i, kind: 'aadhaar' },
  { re: /\bpan\b|permanent account/i, kind: 'pan' },
  { re: /gstin|\bgst\b/i, kind: 'gstin' },
  { re: /ifsc/i, kind: 'ifsc' },
  { re: /\biban\b/i, kind: 'iban' },
  { re: /\bupi\b|vpa|virtual payment/i, kind: 'upi' },
  { re: /account/i, kind: 'iban' }, // "account number" is generic; IBAN check only fires if value is IBAN-shaped (guarded below)
  { re: /mobile|phone|contact number|cell/i, kind: 'mobile' },
  { re: /\bpin\b|postal|zip/i, kind: 'pin' },
];

/** Structural value sniffers used when the label is too vague to tell us the kind. */
const VALUE_SNIFFERS: Array<{ re: RegExp; kind: IdentifierKind }> = [
  { re: /^[0-9]{4}\s?[0-9]{4}\s?[0-9]{4}$/, kind: 'aadhaar' },
  { re: /^[A-Z]{5}[0-9]{4}[A-Z]$/, kind: 'pan' },
  { re: /^[0-9]{2}[A-Z0-9]{13}$/, kind: 'gstin' },
  { re: /^[A-Z]{4}0[A-Z0-9]{6}$/, kind: 'ifsc' },
  { re: /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/, kind: 'iban' },
  { re: /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.]{1,64}$/, kind: 'upi' },
  { re: /^(\+?91|0)?[6-9][0-9]{9}$/, kind: 'mobile' },
  { re: /^[1-8][0-9]{5}$/, kind: 'pin' },
];

const CHECK_NAMES: Record<IdentifierKind, string> = {
  aadhaar: 'Aadhaar number checksum',
  pan: 'PAN format & entity code',
  gstin: 'GSTIN checksum',
  ifsc: 'IFSC format',
  iban: 'IBAN checksum',
  upi: 'UPI VPA format',
  mobile: 'Mobile number format',
  pin: 'PIN code format',
};

const VALIDATORS: Record<IdentifierKind, (v: string) => ValidationResult> = {
  aadhaar: validateAadhaar,
  pan: validatePAN,
  gstin: validateGSTIN,
  ifsc: validateIFSC,
  iban: validateIBAN,
  upi: validateUPI,
  mobile: validateIndianMobile,
  pin: validatePIN,
};

/**
 * Determines which validator (if any) applies to a given field, using the
 * label first, then falling back to structural sniffing of the value so we
 * still catch identifiers behind vague labels like "Number" or "ID".
 */
function detectIdentifierKind(label: string, value: string): IdentifierKind | null {
  const lowerLabel = (label ?? '').toLowerCase();
  const val = (value ?? '').trim();

  // 1) Label-driven hints, in priority order. Skip the generic "account"
  //    hint unless the value is actually IBAN-shaped (avoids misfiring on
  //    plain bank account numbers, which have no public checksum).
  for (const hint of LABEL_HINTS) {
    if (hint.re.test(lowerLabel)) {
      if (hint.kind === 'iban' && !/^[A-Z]{2}[0-9]{2}/.test(clean(val))) {
        continue;
      }
      return hint.kind;
    }
  }

  // 2) Fall back to structural sniffing of the value itself.
  const cleanedVal = clean(val);
  for (const sniff of VALUE_SNIFFERS) {
    if (sniff.re.test(sniff.kind === 'upi' ? val : cleanedVal)) {
      return sniff.kind;
    }
  }

  return null;
}

// --- Date-logic helpers -----------------------------------------------------

/** Labels that plausibly carry a date. */
const DATE_LABEL_RE = /\b(dob|date of birth|birth date|issue date|date of issue|issued on|expiry|expiration|valid until|valid upto|date of expiry)\b/i;

/**
 * Attempts to unambiguously parse a date string in common Indian document
 * formats (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD). Returns null rather than
 * guessing when the format is ambiguous (e.g. plain MM/DD/YYYY territory).
 */
function parseUnambiguousDate(raw: string): Date | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  // YYYY-MM-DD (ISO, unambiguous)
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return validDateOrNull(+y, +mo, +d);
  }

  // DD/MM/YYYY or DD-MM-YYYY (Indian convention). Unambiguous when the
  // first component is >12 (cannot be a month), or when we simply commit to
  // day-first per Indian document convention but guard obviously-invalid
  // month/day ranges.
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return validDateOrNull(+y, +mo, +d);
  }

  // DD Month YYYY (e.g. "05 Jan 1990" or "05 January 1990") — unambiguous.
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{4})$/);
  if (m) {
    const [, d, monName, y] = m;
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const idx = months.findIndex((mo) => monName.toLowerCase().startsWith(mo));
    if (idx === -1) return null;
    return validDateOrNull(+y, idx + 1, +d);
  }

  return null;
}

function validDateOrNull(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // Reject rollover (e.g. Feb 30 -> Mar 2)
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

/**
 * Scans a set of extracted fields for identifiers Pramaan can mathematically
 * validate, plus conservative date-logic checks. Never invents a check: if
 * nothing matches, returns empty arrays.
 */
export function runDeterministicChecks(fields: ExtractedField[]): DeterministicChecksResult {
  const checks: ConsistencyCheck[] = [];
  const signals: TechnicalSignal[] = [];
  let hardFailures = 0;

  const safeFields = Array.isArray(fields) ? fields : [];

  // --- Identifier checksum/format checks ------------------------------
  for (const field of safeFields) {
    if (!field || typeof field.value !== 'string') continue;
    const value = field.value.trim();
    if (!value) continue;

    const kind = detectIdentifierKind(field.label, value);
    if (!kind) continue;

    const result = VALIDATORS[kind](value);
    const checkName = `${CHECK_NAMES[kind]} (${field.label || 'unlabeled field'})`;

    checks.push({
      check: checkName,
      status: result.valid ? 'PASS' : 'FAIL',
      detail: result.reason,
    });

    signals.push({
      label: `${CHECK_NAMES[kind]} — ${field.label || 'unlabeled field'}`,
      value: result.valid ? 'Valid' : 'Invalid',
      concern: !result.valid,
    });

    if (!result.valid) hardFailures++;
  }

  // --- Date-logic checks (conservative, only on unambiguous parses) ---
  const dateFields: { label: string; value: string; date: Date }[] = [];
  for (const field of safeFields) {
    if (!field || typeof field.value !== 'string' || typeof field.label !== 'string') continue;
    if (!DATE_LABEL_RE.test(field.label)) continue;
    const parsed = parseUnambiguousDate(field.value);
    if (parsed) dateFields.push({ label: field.label, value: field.value, date: parsed });
  }

  const now = new Date();

  const findByRe = (re: RegExp) => dateFields.find((f) => re.test(f.label));
  const dob = findByRe(/\b(dob|date of birth|birth date)\b/i);
  const issue = findByRe(/\b(issue date|date of issue|issued on)\b/i);
  const expiry = findByRe(/\b(expiry|expiration|valid until|valid upto|date of expiry)\b/i);

  // DOB in the future.
  if (dob && dob.date.getTime() > now.getTime()) {
    checks.push({
      check: 'Date-of-birth plausibility',
      status: 'FAIL',
      detail: `Date of birth ("${dob.value}") is in the future relative to today, which is impossible.`,
    });
    hardFailures++;
  }

  // Issue date after expiry date.
  if (issue && expiry && issue.date.getTime() > expiry.date.getTime()) {
    checks.push({
      check: 'Issue/expiry date ordering',
      status: 'FAIL',
      detail: `Issue date ("${issue.value}") is after the expiry date ("${expiry.value}"), which is logically inconsistent.`,
    });
    hardFailures++;
  }

  // Stated age vs DOB, only when both exist and the age field is an
  // unambiguous plain integer.
  const ageField = safeFields.find(
    (f) => f && typeof f.label === 'string' && /\bage\b/i.test(f.label) && typeof f.value === 'string' && /^\d{1,3}$/.test(f.value.trim())
  );
  if (dob && ageField) {
    const statedAge = parseInt(ageField.value.trim(), 10);
    let computedAge = now.getUTCFullYear() - dob.date.getUTCFullYear();
    const hasHadBirthdayThisYear =
      now.getUTCMonth() > dob.date.getUTCMonth() ||
      (now.getUTCMonth() === dob.date.getUTCMonth() && now.getUTCDate() >= dob.date.getUTCDate());
    if (!hasHadBirthdayThisYear) computedAge--;

    if (Math.abs(computedAge - statedAge) > 1) {
      // Allow a 1-year tolerance for "as of" ambiguity on the document.
      checks.push({
        check: 'Stated age vs date of birth',
        status: 'FAIL',
        detail: `Stated age (${statedAge}) is inconsistent with date of birth ("${dob.value}"), which implies an age of ${computedAge}.`,
      });
      hardFailures++;
    } else {
      checks.push({
        check: 'Stated age vs date of birth',
        status: 'PASS',
        detail: `Stated age (${statedAge}) is consistent with date of birth ("${dob.value}").`,
      });
    }
  }

  return { checks, signals, hardFailures };
}
