/**
 * referenceData.ts
 * -----------------
 * Structured knowledge base of INDIAN DOCUMENT FORMAT RULES for Pramaan.
 *
 * *** PRIVACY BOUNDARY — NON-NEGOTIABLE ***
 * Everything in this file is a FORMAT / VALIDATION RULE: official public code
 * lists (GST state codes, IFSC bank prefixes, PIN code regions), published
 * checksum algorithms, and issuer conventions. There is NO real personal
 * identity data here — no real Aadhaar numbers, PAN numbers, names,
 * addresses, photographs, or specimen records of real people. Every example
 * value in this file and in api/verification.test.mjs is a clearly
 * fictional, structurally-valid placeholder. Do not add real identity data
 * to this file.
 *
 * HONESTY RULE (same philosophy as verification.ts): structural validity is
 * NOT proof a document was issued. A well-formed number, a correct state
 * code, or a matching bank prefix only proves the printed value is
 * internally consistent with the public rule set below — never that a
 * registry issued it, that it belongs to the document holder, or that the
 * document itself is genuine. Anything that needs a live registry/issuer
 * check belongs in `externalChecksNeeded`, never asserted here as proof.
 */

// ===========================================================================
// GSTIN state codes (01-38)
// ===========================================================================
// Official numeric state/UT codes used as the first two characters of a
// GSTIN, per the Census 2011 state code list adopted by GSTN. This is public
// administrative geography, not personal data. Codes 01-38 are the full
// currently-allotted envelope (25 "Daman & Diu" was retired and merged into
// 26 "Dadra & Nagar Haveli and Daman & Diu" in 2020, but is kept here as a
// legacy-valid code since older GSTINs issued before the merger still carry
// it — treating it as invalid would produce a false positive on real,
// still-valid registrations).

export const GSTIN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman and Diu (legacy — merged into 26 in 2020)',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (legacy pre-bifurcation code)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
};

/** Returns the state/UT name for a 2-digit GST state code, or null if the code is not in the official 01-38 envelope. */
export function gstStateName(code: string): string | null {
  const c = (code ?? '').trim();
  return GSTIN_STATE_CODES[c] ?? null;
}

// ===========================================================================
// PAN — 4th character (entity type) and 5th character (name-initial) rules
// ===========================================================================
// Per Income Tax Department PAN structure (form 49A/49AA allotment rules):
// AAAAA9999A
//   chars 1-3: alphabetic series (no semantic meaning we can check)
//   char 4:    entity type of the PAN holder
//   char 5:    first letter of the individual's surname/last name (for
//              entity type 'P'), or first letter of the entity's registered
//              name (for every other entity type)
//   chars 6-9: sequential digits (no semantic meaning we can check)
//   char 10:   alphabetic checksum character (not independently computable
//              from the other characters without the Department's internal
//              table — we do not fabricate a checksum here)

export const PAN_ENTITY_TYPES: Record<string, string> = {
  P: 'Individual (Person)',
  C: 'Company',
  H: 'Hindu Undivided Family (HUF)',
  F: 'Firm / Limited Liability Partnership',
  A: 'Association of Persons (AOP)',
  T: 'Trust',
  B: 'Body of Individuals (BOI)',
  L: 'Local Authority',
  J: 'Artificial Juridical Person',
  G: 'Government',
};

/** Returns the meaning of a PAN 4th-character entity-type code, or null if unrecognised. */
export function panEntityType(ch: string): string | null {
  const c = (ch ?? '').trim().toUpperCase();
  return PAN_ENTITY_TYPES[c] ?? null;
}

/** The 5th character of a (structurally valid, 10-char) PAN — the name-initial character — or null if the input isn't PAN-shaped. */
export function panNameCheckLetter(pan: string): string | null {
  const s = (pan ?? '').trim().toUpperCase();
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s)) return null;
  return s[4];
}

/**
 * Extracts plausible "name-initial" candidate letters from a printed name,
 * covering the two common print orders seen on Indian documents ("Given
 * Surname" and "Surname, Given" / "Surname Given"): the first letter of the
 * first token, and the first letter of the last token. We check both rather
 * than assuming one order, so we never manufacture a false mismatch purely
 * from name-order ambiguity.
 */
export function nameInitialCandidates(name: string): string[] {
  const cleaned = (name ?? '')
    .replace(/[,.]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (cleaned.length === 0) return [];
  const first = cleaned[0][0]?.toUpperCase();
  const last = cleaned[cleaned.length - 1][0]?.toUpperCase();
  const out = new Set<string>();
  if (first) out.add(first);
  if (last) out.add(last);
  return Array.from(out);
}

// ===========================================================================
// Aadhaar structural rules (knowledge only — the checksum math itself lives
// in verification.ts's Verhoeff implementation)
// ===========================================================================

export const AADHAAR_RULES = {
  digitLength: 12,
  forbiddenLeadingDigits: ['0', '1'] as const,
  checkDigitAlgorithm: 'Verhoeff (1969)',
  vid: {
    digitLength: 16,
    description:
      'Virtual ID (VID) — a temporary, revocable 16-digit substitute for the Aadhaar number itself, generated by the resident via UIDAI. Same digits-only, non-zero/one-leading shape check as Aadhaar; also protected by its own Verhoeff check digit.',
  },
  /**
   * The single most important honesty note in this whole knowledge base:
   * passing every structural rule (length, leading-digit, Verhoeff) proves
   * only that the number COULD be a real Aadhaar number under UIDAI's
   * allocation scheme — it is not proof the number was ever issued, or that
   * it belongs to the person presenting the document. Verhoeff numbers are
   * dense enough that adversarially-generated numbers routinely pass. The
   * ONLY real proof of an Aadhaar document's authenticity is offline
   * verification of its QR code or downloaded XML against UIDAI's published
   * digital signature (public key) — which is a live/offline-artifact
   * cryptographic check this deterministic text-only module cannot perform,
   * and belongs in externalChecksNeeded.
   */
  proofNote:
    'A structurally valid Aadhaar number is NOT proof of issuance. Only offline QR/XML signature verification against the UIDAI public key proves a specific Aadhaar document is genuine.',
};

// ===========================================================================
// IFSC — bank-code prefixes
// ===========================================================================
// IFSC = 4-letter bank code + literal '0' (reserved for future use by RBI) +
// 6-character branch code. The bank-code map below covers commonly seen
// Indian scheduled banks; it is illustrative, not exhaustive — an IFSC whose
// 4-letter prefix is absent from this map is NOT thereby proven invalid, it
// is simply an unrecognised-but-still-well-formed code (say so, don't fail).

export const IFSC_BANK_CODES: Record<string, string> = {
  SBIN: 'State Bank of India',
  HDFC: 'HDFC Bank',
  ICIC: 'ICICI Bank',
  UTIB: 'Axis Bank',
  PUNB: 'Punjab National Bank',
  BARB: 'Bank of Baroda',
  CNRB: 'Canara Bank',
  KKBK: 'Kotak Mahindra Bank',
  INDB: 'IndusInd Bank',
  IDIB: 'Indian Bank',
  IOBA: 'Indian Overseas Bank',
  UBIN: 'Union Bank of India',
  CBIN: 'Central Bank of India',
  MAHB: 'Bank of Maharashtra',
  BKID: 'Bank of India',
  YESB: 'Yes Bank',
  IDFB: 'IDFC First Bank',
  FDRL: 'Federal Bank',
  SIBL: 'South Indian Bank',
  KVBL: 'Karur Vysya Bank',
  PSIB: 'Punjab and Sind Bank',
  UCBA: 'UCO Bank',
  DBSS: 'DBS Bank India',
  RATN: 'RBL Bank',
  DCBL: 'DCB Bank',
  KARB: 'Karnataka Bank',
  TMBL: 'Tamilnad Mercantile Bank',
  AUBL: 'AU Small Finance Bank',
  ESFB: 'Equitas Small Finance Bank',
};

/** Returns the bank name for a 4-letter IFSC bank-code prefix, or null if not in this reference set (unknown, not necessarily invalid). */
export function ifscBankName(code: string): string | null {
  const c = (code ?? '').trim().toUpperCase();
  return IFSC_BANK_CODES[c] ?? null;
}

// ===========================================================================
// Indian PIN (postal index number) code rules
// ===========================================================================
// 6 digits; the first digit denotes one of 9 India Post postal regions.
// Digit '9' is reserved for the Army Postal Service / Field Post Office
// network and is intentionally excluded from civilian validation (see
// validatePIN in verification.ts, which accepts 1-8).

export const PIN_REGION_MAP: Record<string, string> = {
  '1': 'Delhi, Haryana, Punjab, Himachal Pradesh, Jammu and Kashmir, Ladakh, Chandigarh',
  '2': 'Uttar Pradesh, Uttarakhand',
  '3': 'Rajasthan, Gujarat, Daman and Diu, Dadra and Nagar Haveli',
  '4': 'Maharashtra, Madhya Pradesh, Chhattisgarh, Goa',
  '5': 'Andhra Pradesh, Telangana, Karnataka',
  '6': 'Tamil Nadu, Kerala, Puducherry, Lakshadweep',
  '7': 'West Bengal, Odisha, Assam and the North-Eastern states, Andaman and Nicobar Islands',
  '8': 'Bihar, Jharkhand',
  '9': 'Army Postal Service / Field Post Office (reserved, not a civilian address region)',
};

/** Returns the broad India Post region description for a PIN code's first digit, or null for an unrecognised/empty input. */
export function pinRegionName(pinCode: string): string | null {
  const d = (pinCode ?? '').trim()[0];
  return d ? (PIN_REGION_MAP[d] ?? null) : null;
}

// ===========================================================================
// Indian mobile number rules (knowledge only — validator lives in verification.ts)
// ===========================================================================

export const MOBILE_RULES = {
  digitLength: 10,
  validLeadingDigits: ['6', '7', '8', '9'] as const,
  allocator: 'TRAI (Telecom Regulatory Authority of India)',
};

// ===========================================================================
// Vehicle registration, EPIC (voter ID), and driving licence structural patterns
// ===========================================================================
// These are FORMAT patterns only — matching a pattern proves the number is
// well-formed, never that the RTO/ECI record behind it exists.

export const VEHICLE_REGISTRATION_PATTERNS = {
  /** Classic state-issued format: 2-letter state code, 1-2 digit RTO code, 0-3 letter series, 4-digit number. e.g. "MH12AB1234". */
  standard: /^[A-Z]{2}[0-9]{1,2}[A-Z]{0,3}[0-9]{4}$/,
  /** Bharat (BH) series introduced 2021 for portable nationwide registration: 2-digit year of registration, literal "BH", 4 digits, 2 letters. e.g. "21BH1234AB". */
  bhSeries: /^[0-9]{2}BH[0-9]{4}[A-Z]{2}$/,
};

/**
 * EPIC (Electors Photo Identity Card / "Voter ID") number: modern format is
 * 3 uppercase letters (state-issuing series) followed by 7 digits (10
 * characters total), e.g. "ABC1234567". Pre-2000 EPIC numbers used other,
 * less standardised lengths and are not covered here.
 */
export const EPIC_PATTERN = /^[A-Z]{3}[0-9]{7}$/;

/**
 * Driving licence number: state code (2 letters) + RTO code (2 digits) +
 * year of issue (4 digits) + 7-digit sequence number = 15 characters, e.g.
 * "MH1220230001234". Some states print it with hyphens/spaces — normalise
 * (strip whitespace/hyphens, uppercase) before matching.
 */
export const DRIVING_LICENCE_PATTERN = /^[A-Z]{2}[0-9]{2}(19|20)[0-9]{2}[0-9]{7}$/;

// ===========================================================================
// Document expectation profiles
// ===========================================================================
// For each document category: the fields a GENUINE instance must carry, and
// the classic tamper targets fraudsters go after. Absence of an expected
// field is a WARN-level prompt to check the original — never a hard proof
// of forgery (the field may simply not have been extracted/OCR'd).

export interface RequiredFieldHint {
  /** Human-readable field name shown in the check. */
  name: string;
  /** Case-insensitive regex (as a string) matched against extracted-field labels. */
  pattern: string;
}

export interface DocumentExpectationProfile {
  key: string;
  label: string;
  requiredFieldHints: RequiredFieldHint[];
  /** Classic tamper targets fraudsters go after on this document type. */
  tamperTargets: string[];
  /** Signature/seal-specific tamper targets and how a reviewer can catch them (see also SIGNATURE_FORGERY_INDICATORS). */
  signatureAndSealGuidance: string[];
}

export const DOCUMENT_EXPECTATION_PROFILES: Record<string, DocumentExpectationProfile> = {
  income_certificate: {
    key: 'income_certificate',
    label: 'Income Certificate',
    requiredFieldHints: [
      { name: 'issuing authority', pattern: '\\b(issuing authority|tehsildar|revenue officer|sdm|mandal revenue officer|issued by)\\b' },
      { name: 'certificate / reference number', pattern: '\\b(certificate no|certificate number|serial no|reference no|application no)\\b' },
      { name: 'date of issue', pattern: '\\b(date of issue|issue date|issued on)\\b' },
      { name: 'validity period', pattern: '\\b(valid until|valid upto|validity)\\b' },
      { name: "signatory's designation", pattern: '\\b(designation|competent authority|signing authority)\\b' },
      { name: 'official seal/stamp', pattern: '\\b(seal|stamp)\\b' },
    ],
    tamperTargets: [
      'Annual income figure altered (digits changed or a decimal point shifted) to fit under a scheme\'s income cap.',
      'Validity date extended past the original (typically 6-12 month) issuance window.',
      'Issuing office/authority name or designation swapped for a different or higher office than the one that actually signed it.',
      'Certificate/application number reused, or numerically implausible for the stated issue date (e.g. a lower serial with a later date than a higher serial on file).',
      'Applicant name or family details edited after issuance while the certificate number/seal are left untouched.',
    ],
    signatureAndSealGuidance: [
      'Genuine income certificates are almost always wet-ink signed and physically stamped — a signature that is pixel-identical across two "different" certificates, or that floats over the seal instead of under it, indicates a scanned/pasted signature.',
      'Check that the printed name/designation under the signature matches the "issuing authority" field elsewhere on the certificate.',
    ],
  },

  caste_certificate: {
    key: 'caste_certificate',
    label: 'Caste Certificate',
    requiredFieldHints: [
      { name: 'issuing authority', pattern: '\\b(issuing authority|tehsildar|revenue officer|sdm|district magistrate|issued by)\\b' },
      { name: 'certificate / reference number', pattern: '\\b(certificate no|certificate number|serial no|reference no)\\b' },
      { name: 'date of issue', pattern: '\\b(date of issue|issue date|issued on)\\b' },
      { name: 'caste / community category', pattern: '\\b(caste|community|category)\\b' },
      { name: "signatory's designation", pattern: '\\b(designation|competent authority)\\b' },
      { name: 'official seal/stamp', pattern: '\\b(seal|stamp)\\b' },
    ],
    tamperTargets: [
      'Caste/community category altered (e.g. General/OBC swapped to SC/ST) to qualify for reservation benefits.',
      'Validity/permanence wording altered — most caste certificates are permanent once issued, so an added "valid until" date is itself a red flag.',
      'Certificate number reused across applicants, or the same certificate number appearing with two different names in separate submissions.',
      'District/taluka of issuance changed to imply a different, more favourable local quota.',
    ],
    signatureAndSealGuidance: [
      'Caste certificates typically carry a raised/embossed or ink stamp seal in addition to a signature — a seal that is a flat, low-resolution scanned rectangle (visible halo, mismatched DPI vs the rest of the page) suggests a composited image rather than a physical stamp impression.',
      'Compare the signatory\'s designation printed on the certificate against known office-holder designations for that Tehsil/SDM office and issue date, where that context is available.',
    ],
  },

  domicile_certificate: {
    key: 'domicile_certificate',
    label: 'Domicile Certificate',
    requiredFieldHints: [
      { name: 'issuing authority', pattern: '\\b(issuing authority|tehsildar|revenue officer|sdm|district magistrate|issued by)\\b' },
      { name: 'certificate / reference number', pattern: '\\b(certificate no|certificate number|serial no|reference no)\\b' },
      { name: 'date of issue', pattern: '\\b(date of issue|issue date|issued on)\\b' },
      { name: 'duration/period of residence', pattern: '\\b(residing since|resident since|period of residence|duration of stay)\\b' },
      { name: "signatory's designation", pattern: '\\b(designation|competent authority)\\b' },
      { name: 'official seal/stamp', pattern: '\\b(seal|stamp)\\b' },
    ],
    tamperTargets: [
      'Residence start date pushed further into the past to satisfy a minimum-years-of-residence eligibility rule.',
      'Address/district altered to claim domicile in a state with a more favourable quota or scheme.',
      'Certificate number or issue date altered independently of each other, breaking the office\'s real sequential numbering.',
    ],
    signatureAndSealGuidance: [
      'Same guidance as income/caste certificates: look for a signature/seal that sits as a separate flat image layer rather than physically overlapping the paper texture and any crease/fold artefacts visible elsewhere on the scan.',
    ],
  },

  bank_statement: {
    key: 'bank_statement',
    label: 'Bank Statement',
    requiredFieldHints: [
      { name: 'account number', pattern: '\\baccount (no|number)\\b' },
      { name: 'IFSC code', pattern: '\\bifsc\\b' },
      { name: 'statement period', pattern: '\\b(statement period|from date|to date|period)\\b' },
      { name: 'opening/closing balance', pattern: '\\b(opening balance|closing balance)\\b' },
      { name: 'bank branch / address', pattern: '\\b(branch|bank address)\\b' },
      { name: 'authorised signatory / bank seal', pattern: '\\b(authorised signatory|authorized signatory|bank seal|seal|stamp)\\b' },
    ],
    tamperTargets: [
      'Individual transaction rows edited, inserted, or deleted to inflate an average/minimum balance, with the running balance column not recomputing consistently row-to-row.',
      'Closing balance edited without the sum of listed transactions actually reconciling to it.',
      'Font, cell alignment, or column spacing subtly different in the edited row(s) versus the rest of the (usually machine-generated, monospaced or table-rendered) statement.',
      'IFSC code and branch name printed on the statement not matching each other (cross-check IFSC bank-code prefix against the stated bank name).',
      'Page footer/header (account holder name, account number, page X of Y) missing or inconsistent on an inserted page.',
    ],
    signatureAndSealGuidance: [
      'Most bank statements are system-generated and carry no wet-ink signature at all — a hand-signed "bank statement" (as opposed to a certified true copy or manually-issued balance certificate) is itself unusual and worth confirming with the issuing branch.',
      'Where a bank seal/stamp IS present (e.g. on a manually certified statement), check it against the account\'s IFSC-derived bank name for a mismatch.',
    ],
  },

  commercial_invoice_gst: {
    key: 'commercial_invoice_gst',
    label: 'Commercial Invoice (GST)',
    requiredFieldHints: [
      { name: 'GSTIN (seller)', pattern: '\\bgstin\\b' },
      { name: 'invoice number', pattern: '\\binvoice (no|number)\\b' },
      { name: 'invoice date', pattern: '\\binvoice date\\b' },
      { name: 'HSN/SAC code', pattern: '\\b(hsn|sac)\\b' },
      { name: 'taxable value and GST breakup (CGST/SGST/IGST)', pattern: '\\b(cgst|sgst|igst|taxable value)\\b' },
      { name: "authorised signatory", pattern: '\\b(authorised signatory|authorized signatory|for and on behalf of)\\b' },
    ],
    tamperTargets: [
      'GSTIN altered while the embedded PAN portion (characters 3-12) no longer matches a separately printed PAN on the same invoice — always cross-check these two fields against each other.',
      'Tax amount (CGST/SGST/IGST) recalculated incorrectly relative to the printed rate and taxable value — recompute and compare.',
      'Invoice number sequence gap or reuse versus the invoice date, inconsistent with the seller\'s normal numbering.',
      'HSN/SAC code changed to one carrying a lower GST rate than the actual goods/services described.',
      'Buyer GSTIN\'s state code not matching the "place of supply" field, which changes whether CGST+SGST or IGST should apply.',
    ],
    signatureAndSealGuidance: [
      'A GST tax invoice does not require a signature to be legally valid when issued as a digital/e-invoice with a valid IRN/QR code — a printed invoice that has neither an e-invoice QR code nor an authorised-signatory line is a structural gap worth flagging, not proof of forgery on its own.',
    ],
  },

  marksheet: {
    key: 'marksheet',
    label: 'Marksheet / Grade Sheet',
    requiredFieldHints: [
      { name: 'issuing board/university', pattern: '\\b(board|university|examination board)\\b' },
      { name: 'roll number / registration number', pattern: '\\b(roll no|roll number|registration no|registration number|seat no)\\b' },
      { name: 'examination/passing date or year', pattern: '\\b(examination date|passing year|year of passing|date of exam)\\b' },
      { name: "controller/registrar's signature", pattern: '\\b(controller of examinations|registrar|signature)\\b' },
      { name: 'official seal/hologram', pattern: '\\b(seal|hologram|stamp)\\b' },
    ],
    tamperTargets: [
      'Individual subject marks altered (digits changed) while the printed total/percentage is not recomputed to match — always recompute the total from the listed subject marks.',
      'Grade/division upgraded (e.g. Second Division to First Division) without the underlying marks supporting it.',
      'Roll number or registration number altered while the name/photo (if present) stay the same, or vice versa.',
      'Font or spacing inconsistency in the row(s) that were edited versus the board\'s standard machine-printed layout.',
      'Security features described by the issuing board (hologram, watermark, micro-text, QR verification code) missing or replaced with a low-resolution scanned substitute.',
    ],
    signatureAndSealGuidance: [
      'Boards typically pre-print the Controller of Examinations\' signature and seal as part of the original press run, so it should have identical print quality/registration to the rest of the document — a signature/seal with visibly different resolution, colour depth, or slight rotation versus the surrounding printed text is the classic tell of a pasted-in image.',
      'Where the board publishes a verification QR code or portal, its absence on an otherwise "official" marksheet is a gap worth flagging in externalChecksNeeded.',
    ],
  },
};

// Free-text aliases used to map an arbitrary `documentType` string (as
// stored on AnalysisReport) onto one of the profiles above. Matching is a
// simple case-insensitive substring test — deliberately conservative, so we
// never silently misclassify a document into the wrong expectation profile.
const DOCUMENT_TYPE_ALIASES: Record<string, string[]> = {
  income_certificate: ['income certificate', 'income cert', 'annual income certificate'],
  caste_certificate: ['caste certificate', 'caste cert', 'community certificate'],
  domicile_certificate: ['domicile certificate', 'residence certificate', 'domicile cert'],
  bank_statement: ['bank statement', 'account statement', 'passbook statement'],
  commercial_invoice_gst: ['commercial invoice', 'gst invoice', 'tax invoice', 'invoice'],
  marksheet: ['marksheet', 'mark sheet', 'gradesheet', 'grade sheet', 'transcript', 'result sheet'],
};

/**
 * Looks up the document-expectation profile for a free-text document-type
 * string (e.g. AnalysisReport.documentType). Returns null — rather than a
 * guessed/nearest profile — when nothing in the alias table matches, so
 * callers never silently apply the wrong document's tamper-target list.
 */
export function expectationsFor(docType: string): DocumentExpectationProfile | null {
  const norm = (docType ?? '').toLowerCase().trim();
  if (!norm) return null;
  for (const [key, aliases] of Object.entries(DOCUMENT_TYPE_ALIASES)) {
    if (aliases.some((alias) => norm.includes(alias))) {
      return DOCUMENT_EXPECTATION_PROFILES[key] ?? null;
    }
  }
  return null;
}

// ===========================================================================
// Signature forgery — general guidance ("how to catch fake signatures")
// ===========================================================================
// This module is a deterministic TEXT-and-structure layer with no access to
// document pixels, so it cannot itself run image forensics on a signature.
// The list below is reference GUIDANCE — the kind of thing a human reviewer,
// or a future pixel-level forensics module, should look for. Do not treat
// matching/not-matching an item here as a computed check result; it is
// knowledge content, not a validator.

export const SIGNATURE_FORGERY_INDICATORS: string[] = [
  'Pasted/composited signature: a rectangular halo of mismatched background colour, sharpness, or resolution around the signature versus the surrounding scanned paper — the classic sign of an image cropped in from elsewhere and dropped onto the page.',
  'Traced or template signature: unnaturally uniform stroke width, speed, and pressure throughout — genuine handwriting varies in pressure and speed even within one signature, especially at stroke start/end points.',
  'Duplicate-across-documents: the exact same signature (pixel-for-pixel, not just similar) appears on two supposedly separately-signed documents — real handwriting is never perfectly identical twice; an exact match implies copy-paste from one scan.',
  'Layer-order mismatch: the signature appears to float above a printed line, stamp, or box that it should visually sit behind (or vice versa) — a strong indicator of digital compositing rather than a single wet-ink/print pass.',
  'Ink/colour inconsistency: the signature\'s ink colour, saturation, or line thickness is inconsistent with other handwritten annotations on the same document, or is suspiciously identical to the body text\'s printed ink (suggesting it was never actually wet-ink).',
  'No matching printed name/designation beneath the signature, or the name typed below the signature does not match the signatory\'s name/designation claimed elsewhere in the document.',
  'Signature crosses a fold, crease, staple mark, or scan artefact inconsistently with the rest of the page content around it (e.g. crisp where the paper texture is blurred, or vice versa).',
  'Seal/stamp impression that should physically overlap the signature (common in Indian government certificates) instead sits as a cleanly separable, axis-aligned rectangle — consistent with a scanned stamp image pasted on top rather than a real ink impression.',
];

/**
 * Honest scope note for the caller: pixel-level signature/seal forensics
 * (edge analysis, ELA, resolution/DPI comparison, ink-colour histograms)
 * is out of scope for this text-only reference module. Any actual visual
 * signature-forgery detection belongs in an image-forensics module working
 * on the source image, with SIGNATURE_FORGERY_INDICATORS used as the list
 * of things to look for — never asserted here as a computed result.
 */
export const SIGNATURE_FORENSICS_SCOPE_NOTE: string =
  'Structural/text checks cannot prove a signature is forged or genuine — only pixel-level image forensics on the original scan can. Treat SIGNATURE_FORGERY_INDICATORS as a review checklist, not an automated verdict.';
