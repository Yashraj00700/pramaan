import {
  GSTIN_STATE_CODES,
  gstStateName,
  PAN_ENTITY_TYPES,
  panEntityType,
  panNameCheckLetter,
  nameInitialCandidates,
  ifscBankName,
  pinRegionName,
  expectationsFor,
  type DocumentExpectationProfile,
} from './referenceData.js';

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

// 4th character of a PAN encodes the holder's entity type; 5th character is
// a name-initial check. Both rule sets live in referenceData.ts, the single
// source of truth for Indian document format rules (see PAN_ENTITY_TYPES,
// panEntityType(), panNameCheckLetter()).

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
  const entityMeaning = panEntityType(entityCode);
  if (!entityMeaning) {
    return {
      valid: false,
      reason: `4th character '${entityCode}' is not a recognised PAN entity-type code (expected one of ${Object.keys(PAN_ENTITY_TYPES).join('/')}).`,
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

// Valid GST state codes — sourced from referenceData.ts's official 01-38
// state/UT map (GSTIN_STATE_CODES), so an invalid/non-existent state code is
// detectable against the real list rather than a bare numeric range.
const GSTIN_VALID_STATE_CODES = new Set(Object.keys(GSTIN_STATE_CODES));

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
    return { valid: false, reason: `GSTIN state code '${stateCode}' is not a valid state code (expected 01-38, per the official GST state/UT code list).` };
  }
  const stateName = gstStateName(stateCode);

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
    reason: `GSTIN state code ${stateCode} (${stateName ?? 'unrecognised state name'}), embedded PAN, and mod-36 checksum are all valid.`,
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
  const bankCode = s.slice(0, 4);
  const bankName = ifscBankName(bankCode);
  return {
    valid: true,
    reason: bankName
      ? `IFSC format is valid — bank code '${bankCode}' (${bankName}), branch code '${s.slice(5)}'.`
      : `IFSC format is valid — bank code '${bankCode}' is not in our common-bank reference list (unrecognised, not necessarily invalid), branch code '${s.slice(5)}'.`,
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
  const region = pinRegionName(s);
  return {
    valid: true,
    reason: region
      ? `PIN code is 6 digits with a valid leading region digit (1-8) — India Post region: ${region}.`
      : 'PIN code is 6 digits with a valid leading region digit (1-8).',
  };
}

// ===========================================================================
// validateMRZ — ICAO 9303 Machine Readable Zone check-digit validation
// ===========================================================================
//
// Supports the three ICAO 9303 MRZ layouts:
//   TD3 (passports)         — 2 lines x 44 characters
//   TD2 (ID cards/visas)    — 2 lines x 36 characters
//   TD1 (ID cards)          — 3 lines x 30 characters
//
// The check-digit algorithm is identical across all three layouts: each
// character maps to a numeric value (0-9 -> itself, A-Z -> 10-35, filler
// '<' -> 0), positions are weighted with the repeating cycle 7, 3, 1, the
// products are summed, and the check digit is that sum mod 10. This same
// arithmetic produces the document-number check digit, the date-of-birth
// check digit, the date-of-expiry check digit, and (composed over several
// fields) the final composite check digit.
//
// Honest limit (same philosophy as every other validator in this file):
// a PASS here proves the MRZ is internally self-consistent — i.e. it was
// not mistyped, OCR'd wrong, or hand-tampered without recomputing the
// checksums — not that the passport/ID itself is genuine or that a live
// registry has this exact person. State that limit in the UI.

export type MRZDocType = 'TD1' | 'TD2' | 'TD3';

export interface MRZFieldCheck {
  /** Human-readable field name, e.g. "Document number", "Composite". */
  field: string;
  /** False for an optional field that is entirely filler ('<') padding. */
  present: boolean;
  /** The check-digit character as printed in the MRZ. */
  provided: string;
  /** The check digit ICAO 9303 arithmetic computes for this field's data. */
  expected: string;
  valid: boolean;
}

export interface MRZValidationResult {
  valid: boolean;
  docType: MRZDocType | null;
  reason: string;
  fields: MRZFieldCheck[];
  /** Best-effort structural extraction (never guessed — read straight off the MRZ data fields). */
  extracted: Record<string, string>;
}

// Weight cycle used positionally (position 0 -> 7, 1 -> 3, 2 -> 1, 3 -> 7, ...).
const MRZ_WEIGHTS = [7, 3, 1];

function mrzCharValue(c: string): number {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 65 + 10;
  if (c === '<') return 0;
  return NaN;
}

/** Computes the ICAO 9303 weighted 7-3-1 mod-10 check digit over `data`. */
function mrzCheckDigit(data: string): number {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = mrzCharValue(data[i]);
    sum += (Number.isNaN(v) ? 0 : v) * MRZ_WEIGHTS[i % 3];
  }
  return sum % 10;
}

function isBlankMrzField(data: string): boolean {
  return data.replace(/</g, '') === '';
}

/**
 * A provided check-digit character matches either literally, or — only when
 * the underlying field is entirely filler — via the common real-world
 * convention where issuers print '<' itself as the check digit for a wholly
 * blank optional field (whose mathematically correct check digit, being an
 * all-zero-value input, is always 0). This mirrors how issuing authorities
 * actually print blank optional-data check digits and avoids a false hard
 * failure on a legitimately blank field; it never masks a genuine mismatch
 * on a field that actually carries data.
 */
function mrzCheckDigitMatches(provided: string, expected: number, dataIsBlank: boolean): boolean {
  if (provided === String(expected)) return true;
  if (dataIsBlank && provided === '<' && expected === 0) return true;
  return false;
}

function buildMrzFieldCheck(field: string, data: string, provided: string): MRZFieldCheck {
  const expected = mrzCheckDigit(data);
  const blank = isBlankMrzField(data);
  return {
    field,
    present: !blank,
    provided,
    expected: String(expected),
    valid: mrzCheckDigitMatches(provided, expected, blank),
  };
}

function mrzReason(docType: MRZDocType, fields: MRZFieldCheck[]): string {
  const failed = fields.filter((f) => !f.valid);
  if (failed.length === 0) {
    return `${docType} MRZ: all ${fields.length} ICAO 9303 check digits (weighted 7-3-1 mod-10) are mathematically valid — the MRZ is internally self-consistent.`;
  }
  const names = failed.map((f) => f.field).join(', ');
  return `${docType} MRZ: ${failed.length} of ${fields.length} check digit(s) fail ICAO 9303 arithmetic (${names}) — this MRZ is not internally self-consistent.`;
}

/** Splits an MRZ name field ("SURNAME<<GIVEN<NAMES<<<...") into [surname, givenNames]. */
function splitMrzName(nameField: string): [string, string] {
  const parts = nameField.split('<<');
  const surname = (parts[0] || '').replace(/</g, ' ').trim().replace(/\s+/g, ' ');
  const given = (parts[1] || '').replace(/</g, ' ').trim().replace(/\s+/g, ' ');
  return [surname, given];
}

function parseTD3(lines: string[]): MRZValidationResult {
  const [line1, line2] = lines;

  const documentNumber = line2.slice(0, 9);
  const documentNumberCheck = line2[9];
  const nationality = line2.slice(10, 13);
  const dob = line2.slice(13, 19);
  const dobCheck = line2[19];
  const sex = line2[20];
  const expiry = line2.slice(21, 27);
  const expiryCheck = line2[27];
  const personalNumber = line2.slice(28, 42);
  const personalNumberCheck = line2[42];
  const compositeCheck = line2[43];
  const compositeData =
    line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 28) + line2.slice(28, 43);

  const fields: MRZFieldCheck[] = [
    buildMrzFieldCheck('Document number', documentNumber, documentNumberCheck),
    buildMrzFieldCheck('Date of birth', dob, dobCheck),
    buildMrzFieldCheck('Date of expiry', expiry, expiryCheck),
    buildMrzFieldCheck('Personal number (optional)', personalNumber, personalNumberCheck),
    buildMrzFieldCheck('Composite', compositeData, compositeCheck),
  ];

  const issuingState = line1.slice(2, 5);
  const [surname, givenNames] = splitMrzName(line1.slice(5));

  const extracted: Record<string, string> = {
    documentNumber: documentNumber.replace(/</g, ''),
    issuingState,
    nationality,
    dateOfBirth: dob,
    sex,
    dateOfExpiry: expiry,
    surname,
    givenNames,
  };
  if (!isBlankMrzField(personalNumber)) extracted.personalNumber = personalNumber.replace(/</g, '');

  return {
    valid: fields.every((f) => f.valid),
    docType: 'TD3',
    reason: mrzReason('TD3', fields),
    fields,
    extracted,
  };
}

function parseTD2(lines: string[]): MRZValidationResult {
  const [line1, line2] = lines;

  const documentNumber = line2.slice(0, 9);
  const documentNumberCheck = line2[9];
  const nationality = line2.slice(10, 13);
  const dob = line2.slice(13, 19);
  const dobCheck = line2[19];
  const sex = line2[20];
  const expiry = line2.slice(21, 27);
  const expiryCheck = line2[27];
  const optionalData = line2.slice(28, 35);
  const compositeCheck = line2[35];
  const compositeData =
    line2.slice(0, 10) + line2.slice(13, 20) + line2.slice(21, 28) + line2.slice(28, 35);

  const fields: MRZFieldCheck[] = [
    buildMrzFieldCheck('Document number', documentNumber, documentNumberCheck),
    buildMrzFieldCheck('Date of birth', dob, dobCheck),
    buildMrzFieldCheck('Date of expiry', expiry, expiryCheck),
    buildMrzFieldCheck('Composite', compositeData, compositeCheck),
  ];

  const issuingState = line1.slice(2, 5);
  const [surname, givenNames] = splitMrzName(line1.slice(5));

  const extracted: Record<string, string> = {
    documentNumber: documentNumber.replace(/</g, ''),
    issuingState,
    nationality,
    dateOfBirth: dob,
    sex,
    dateOfExpiry: expiry,
    surname,
    givenNames,
  };
  if (!isBlankMrzField(optionalData)) extracted.optionalData = optionalData.replace(/</g, '');

  return {
    valid: fields.every((f) => f.valid),
    docType: 'TD2',
    reason: mrzReason('TD2', fields),
    fields,
    extracted,
  };
}

function parseTD1(lines: string[]): MRZValidationResult {
  const [line1, line2, line3] = lines;

  const documentNumber = line1.slice(5, 14);
  const documentNumberCheck = line1[14];
  const optionalData1 = line1.slice(15, 30);
  const dob = line2.slice(0, 6);
  const dobCheck = line2[6];
  const sex = line2[7];
  const expiry = line2.slice(8, 14);
  const expiryCheck = line2[14];
  const nationality = line2.slice(15, 18);
  const optionalData2 = line2.slice(18, 29);
  const compositeCheck = line2[29];
  const compositeData =
    documentNumber + documentNumberCheck + optionalData1 + dob + dobCheck + expiry + expiryCheck + optionalData2;

  const fields: MRZFieldCheck[] = [
    buildMrzFieldCheck('Document number', documentNumber, documentNumberCheck),
    buildMrzFieldCheck('Date of birth', dob, dobCheck),
    buildMrzFieldCheck('Date of expiry', expiry, expiryCheck),
    buildMrzFieldCheck('Composite', compositeData, compositeCheck),
  ];

  const documentCode = line1.slice(0, 2);
  const issuingState = line1.slice(2, 5);
  const [surname, givenNames] = splitMrzName(line3);

  const extracted: Record<string, string> = {
    documentCode,
    documentNumber: documentNumber.replace(/</g, ''),
    issuingState,
    nationality,
    dateOfBirth: dob,
    sex,
    dateOfExpiry: expiry,
    surname,
    givenNames,
  };

  return {
    valid: fields.every((f) => f.valid),
    docType: 'TD1',
    reason: mrzReason('TD1', fields),
    fields,
    extracted,
  };
}

/**
 * Validates a Machine Readable Zone (MRZ) — 2 lines of 44 chars (TD3 /
 * passport), 2 lines of 36 chars (TD2), or 3 lines of 30 chars (TD1) — using
 * pure ICAO 9303 check-digit arithmetic (no OCR, no ML, no network calls).
 * Input lines are normalized (whitespace stripped, uppercased) before
 * layout detection. Never guesses a layout: if the line count/lengths don't
 * match a known MRZ shape, or a line contains a character outside
 * `A-Z0-9<`, returns a `valid:false` result with `docType: null` and an
 * explicit reason rather than fabricating a check.
 */
export function validateMRZ(lines: string[]): MRZValidationResult {
  const cleaned = (Array.isArray(lines) ? lines : [])
    .map((l) => (typeof l === 'string' ? l.replace(/\s+/g, '').toUpperCase() : ''))
    .filter((l) => l.length > 0);

  const charsetRe = /^[A-Z0-9<]+$/;
  const invalidCharLine = cleaned.find((l) => !charsetRe.test(l));
  if (invalidCharLine) {
    return {
      valid: false,
      docType: null,
      reason: 'MRZ lines contain characters outside A-Z, 0-9, and the "<" filler — not a valid MRZ.',
      fields: [],
      extracted: {},
    };
  }

  if (cleaned.length === 2 && cleaned[0].length === 44 && cleaned[1].length === 44) {
    return parseTD3(cleaned);
  }
  if (cleaned.length === 2 && cleaned[0].length === 36 && cleaned[1].length === 36) {
    return parseTD2(cleaned);
  }
  if (cleaned.length === 3 && cleaned.every((l) => l.length === 30)) {
    return parseTD1(cleaned);
  }

  return {
    valid: false,
    docType: null,
    reason: `Could not recognize an ICAO 9303 MRZ layout from ${cleaned.length} line(s) of length(s) ${
      cleaned.map((l) => l.length).join(', ') || 'n/a'
    } — expected 2 lines of 44 (TD3/passport), 2 lines of 36 (TD2), or 3 lines of 30 (TD1).`,
    fields: [],
    extracted: {},
  };
}

// --- MRZ-line detection helpers for runDeterministicChecks -----------------

/**
 * Scans every extracted field's value for lines that are MRZ-shaped: pure
 * `A-Z0-9<` (after stripping whitespace) and exactly 30, 36, or 44
 * characters long. A field's value may itself be a multi-line block (the
 * common case when a vision pass transcribes the whole MRZ verbatim into
 * one field), or the MRZ may be spread across separate single-line fields
 * (e.g. "MRZ Line 1" / "MRZ Line 2") — both are handled the same way here
 * because we flatten every field's value into candidate lines first.
 */
function collectMrzCandidateLines(fields: ExtractedField[]): string[] {
  const lines: string[] = [];
  for (const f of fields) {
    if (!f || typeof f.value !== 'string') continue;
    const rawLines = f.value.split(/\r?\n/);
    for (const raw of rawLines) {
      const l = raw.replace(/\s+/g, '').toUpperCase();
      if (/^[A-Z0-9<]{30}$/.test(l) || /^[A-Z0-9<]{36}$/.test(l) || /^[A-Z0-9<]{44}$/.test(l)) {
        lines.push(l);
      }
    }
  }
  return lines;
}

/** Groups candidate MRZ lines into TD3 (2x44) / TD2 (2x36) / TD1 (3x30) runs, in order. */
function groupMrzLines(lines: string[]): string[][] {
  const groups: string[][] = [];
  let i = 0;
  while (i < lines.length) {
    const len = lines[i].length;
    if ((len === 44 || len === 36) && i + 1 < lines.length && lines[i + 1].length === len) {
      groups.push([lines[i], lines[i + 1]]);
      i += 2;
      continue;
    }
    if (len === 30 && i + 2 < lines.length && lines[i + 1].length === 30 && lines[i + 2].length === 30) {
      groups.push([lines[i], lines[i + 1], lines[i + 2]]);
      i += 3;
      continue;
    }
    i += 1;
  }
  return groups;
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
 * validate, cross-field consistency (PAN vs name, GSTIN vs PAN, PIN vs
 * state) via referenceData.ts, plus conservative date-logic checks. When an
 * optional `docType` is supplied, also checks the field set against that
 * document type's expectation profile (referenceData.ts) for expected-but-
 * missing fields. Never invents a check: if nothing matches, returns empty
 * arrays.
 */
export function runDeterministicChecks(fields: ExtractedField[], docType?: string): DeterministicChecksResult {
  const checks: ConsistencyCheck[] = [];
  const signals: TechnicalSignal[] = [];
  let hardFailures = 0;

  const safeFields = Array.isArray(fields) ? fields : [];

  // --- Identifier checksum/format checks ------------------------------
  // Also remembers which fields matched which kind, so the cross-field
  // consistency checks below (PAN-vs-name, GSTIN-vs-PAN, PIN-vs-state) don't
  // have to re-run detection from scratch.
  const matchedByKind: Partial<Record<IdentifierKind, ExtractedField[]>> = {};
  for (const field of safeFields) {
    if (!field || typeof field.value !== 'string') continue;
    const value = field.value.trim();
    if (!value) continue;

    const kind = detectIdentifierKind(field.label, value);
    if (!kind) continue;
    (matchedByKind[kind] ??= []).push(field);

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

  // --- Cross-field consistency checks using referenceData.ts -----------

  // PAN 5th character vs a printed name field. Soft (WARN) rather than a
  // hard FAIL: name order on Indian documents varies (given-first vs
  // surname-first) and a person's legal PAN does not change on marriage/
  // name change, so a mismatch is a real prompt to double-check, not
  // conclusive proof of tampering.
  const nameField = safeFields.find(
    (f) =>
      f &&
      typeof f.label === 'string' &&
      typeof f.value === 'string' &&
      f.value.trim() &&
      /\bname\b/i.test(f.label) &&
      !/father|mother|guardian|spouse|husband|wife|nominee|witness/i.test(f.label)
  );
  const panFieldsForNameCheck = matchedByKind.pan;
  if (nameField && panFieldsForNameCheck && panFieldsForNameCheck.length > 0) {
    for (const panField of panFieldsForNameCheck) {
      const checkLetter = panNameCheckLetter(panField.value.trim());
      if (!checkLetter) continue;
      const candidates = nameInitialCandidates(nameField.value);
      if (candidates.length === 0) continue;
      const matches = candidates.includes(checkLetter);
      checks.push({
        check: `PAN 5th character vs printed name (${panField.label || 'PAN'} / ${nameField.label})`,
        status: matches ? 'PASS' : 'WARN',
        detail: matches
          ? `PAN 5th character '${checkLetter}' matches the first letter of a name token in "${nameField.value.trim()}", as expected by PAN structure rules.`
          : `PAN 5th character '${checkLetter}' does not match the first letter of any name token in "${nameField.value.trim()}" (checked: ${candidates.join(', ')}). This is a real structural rule for individual PANs, but legitimate mismatches happen (name changes, transliteration, order ambiguity) — treat as a prompt to verify, not proof of tampering.`,
      });
    }
  }

  // GSTIN's embedded PAN (characters 3-12) vs a separately printed PAN
  // field on the same document. Unlike the name check above, this is a
  // direct text-to-text comparison of two printed values — a mismatch is a
  // provable inconsistency between the document's own fields.
  const gstinFieldsForPanCheck = matchedByKind.gstin;
  const panFieldsForGstinCheck = matchedByKind.pan;
  if (gstinFieldsForPanCheck && panFieldsForGstinCheck) {
    for (const gstinField of gstinFieldsForPanCheck) {
      const gstinClean = clean(gstinField.value);
      if (gstinClean.length !== 15) continue;
      const embeddedPan = gstinClean.slice(2, 12);
      for (const panField of panFieldsForGstinCheck) {
        const printedPan = clean(panField.value);
        if (printedPan.length !== 10) continue;
        const match = embeddedPan === printedPan;
        checks.push({
          check: `GSTIN embedded PAN vs printed PAN (${gstinField.label || 'GSTIN'} / ${panField.label || 'PAN'})`,
          status: match ? 'PASS' : 'FAIL',
          detail: match
            ? `PAN embedded in the GSTIN (${embeddedPan}) matches the separately printed PAN (${printedPan}).`
            : `PAN embedded in the GSTIN (${embeddedPan}) does NOT match the separately printed PAN (${printedPan}) — these two fields on the same document are mathematically required to reference the same PAN.`,
        });
        if (!match) hardFailures++;
      }
    }
  }

  // PIN code's India-Post region vs a printed state/address field. Soft
  // (WARN): the region map is broad (covers several states each) and state
  // boundaries have shifted historically, so this only flags an outright
  // region mismatch, never a fine-grained one.
  const pinFieldsForRegionCheck = matchedByKind.pin;
  const stateField = safeFields.find(
    (f) => f && typeof f.label === 'string' && typeof f.value === 'string' && f.value.trim() && /\bstate\b/i.test(f.label)
  );
  if (pinFieldsForRegionCheck && stateField) {
    for (const pinField of pinFieldsForRegionCheck) {
      const region = pinRegionName(clean(pinField.value).replace(/[^0-9]/g, ''));
      if (!region) continue;
      const stateValue = stateField.value.trim().toLowerCase();
      const inRegion = region.toLowerCase().includes(stateValue);
      if (!inRegion) {
        checks.push({
          check: `PIN code region vs stated state (${pinField.label || 'PIN'} / ${stateField.label})`,
          status: 'WARN',
          detail: `PIN code "${pinField.value.trim()}" falls in the India Post region covering ${region}, which does not obviously include the printed state "${stateField.value.trim()}". Regions are broad and this is not conclusive on its own, but is worth checking against the original.`,
        });
      }
    }
  }

  // --- Document-type expectation profile (optional) --------------------
  // Only runs when a docType is supplied (e.g. AnalysisReport.documentType).
  // Flags EXPECTED fields that appear to be missing from the extracted set.
  // This is always a WARN — absence can simply mean the field wasn't
  // extracted, never a proven forgery signal on its own.
  if (docType) {
    const profile: DocumentExpectationProfile | null = expectationsFor(docType);
    if (profile) {
      for (const hint of profile.requiredFieldHints) {
        const re = new RegExp(hint.pattern, 'i');
        const found = safeFields.some(
          (f) => f && typeof f.label === 'string' && typeof f.value === 'string' && f.value.trim() && re.test(f.label)
        );
        if (!found) {
          checks.push({
            check: `Expected field present — ${hint.name} (${profile.label})`,
            status: 'WARN',
            detail: `A genuine ${profile.label} typically carries a ${hint.name}, but no extracted field appears to match it. Absence alone does not prove forgery — the field may simply not have been captured — but it is worth checking against the original document. Classic tamper targets for this document type: ${profile.tamperTargets[0]}`,
          });
        }
      }
    }
  }

  // --- MRZ (Machine Readable Zone) check-digit validation -------------
  const mrzGroups = groupMrzLines(collectMrzCandidateLines(safeFields));
  for (const group of mrzGroups) {
    const mrz = validateMRZ(group);
    if (!mrz.docType) continue; // grouping guarantees a recognizable shape, but never invent a result

    for (const fc of mrz.fields) {
      checks.push({
        check: `MRZ ${fc.field} check digit (${mrz.docType})`,
        status: fc.valid ? 'PASS' : 'FAIL',
        detail: fc.valid
          ? `${fc.field} check digit '${fc.provided}' matches the ICAO 9303 computed value '${fc.expected}'.`
          : `${fc.field} check digit '${fc.provided}' does NOT match the ICAO 9303 computed value '${fc.expected}' — this MRZ field fails its checksum.`,
      });
      signals.push({
        label: `MRZ ${fc.field} — ${mrz.docType}`,
        value: fc.valid ? 'Valid' : 'Invalid',
        concern: !fc.valid,
      });
      if (!fc.valid) hardFailures++;
    }
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
