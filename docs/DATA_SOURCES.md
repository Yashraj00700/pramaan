# Pramaan — External Verification Data Sources

**Status today: none of these are wired up.** The live build (`api/_core.ts`) only computes deterministic signals it can verify itself (SHA-256, PDF producer/creation-vs-modification dates via `pdf-lib`) and sends those + the document to Claude. Claude is explicitly instructed never to fabricate the result of an external lookup — anything that needs one is listed in `externalChecksNeeded` on the `AnalysisReport`. This document is the research behind turning specific `externalChecksNeeded` items into real PASS/FAIL calls, prioritized by what is actually reachable in a hackathon vs. what needs a real partnership.

Every claim below is sourced. Where a vendor's exact per-call price isn't publicly published (common for Indian KYC-aggregator pricing), that is stated explicitly rather than guessed.

---

## How to read the priority tiers

| Tier | Meaning | Timeline to first working call |
|---|---|---|
| **P0 — Hackathon-feasible today** | Free/public, no partner approval, no business KYC | Minutes to ~1 hour |
| **P1 — Fast-follow (paid, self-serve)** | Third-party aggregator, sign up with email + card, sandbox key issued immediately | Same day, pay-as-you-go |
| **P2 — Realistic post-hackathon, not now** | Requires registering a legal entity, business KYC, or a paid annual contract with the official source | Days to weeks |
| **P3 — Needs a government/institutional partnership** | Direct access requires being an approved Requester/Issuer/GSP or a government department itself | Weeks to months, MoU-level |

---

## 1. DigiLocker / e-District (Madhya Pradesh) — source-of-truth govt document verification

**What it verifies:** Whether a specific certificate (caste, income, domicile, marksheet, etc.) actually exists in the issuing government system and matches the uploaded copy field-for-field — the strongest possible signal, because it checks against the *issuer's own record*, not just document plausibility.

**Access model:**
- DigiLocker exposes a documented **Authorized Partner API** (issuer + requester roles) via **API Setu**, the Government of India's open API platform (MeitY). The current spec is v2.2 (Oct 2022).
- To pull a citizen's documents you must be registered as a DigiLocker **Requester** organisation (apply via the API Setu partner portal, get `clientId`/`clientSecret`, pass onboarding review) — this is a real approval process, not instant self-serve signup. No published SDK-purchase fee, but organisational KYC + a security review are required before you get production credentials.
- **eDistrict Madhya Pradesh** is itself listed as a service in the API Setu directory — meaning MP's e-District system is reachable as a DigiLocker-linked issuer, but querying it as a private/third-party app still requires the same Requester approval, and in practice e-District record verification for a specific application/certificate number is typically restricted to other government departments, not open commercial apps.
- Third-party aggregators (Setu, Digio, Gridlines, Cashfree, Meon) resell **consent-based DigiLocker document pull** ("user shares their DigiLocker documents with your app") wrapped in an easier SDK — this is *not* the same as "verify this uploaded scan against the government record"; it's "fetch the document directly from DigiLocker instead of trusting an upload," which is actually a stronger and easier win for a fraud-detection app.

**Cost / rate limits:** Not publicly published for direct DigiLocker partnership; aggregator resellers (Setu, Digio, Gridlines) charge per successful pull, typically bundled into their KYC-API pricing (see §7).

**Integration difficulty:** High for direct MP e-District record-matching (P3 — real government relationship). Medium for "let the user fetch their own document from DigiLocker instead of uploading a scan" via an aggregator SDK (P2 — realistic in weeks, not a 2-hour build).

**Hackathon reality:** Not achievable live. **Correct move for the demo:** keep this as the flagship `externalChecksNeeded` item — e.g. *"Verify this income certificate's application/reference number against the MP e-District portal via DigiLocker before final approval"* — and say explicitly in the pitch that this is the roadmap, not a built integration.

Sources: [DigiLocker Authorized Partner API Spec v2.2](https://cf-media.api-setu.in/resources/DigitalLocker-AuthorizedPartnerAPI-Specificationv2.2.pdf) · [DigiLocker on API Setu](https://apisetu.gov.in/digilocker) · [eDistrict MP — API Setu directory](https://directory.apisetu.gov.in/api-collection/edistrictmp) · [DigiLocker Requester partners](https://www.digilocker.gov.in/web/partners/requesters) · [Setu DigiLocker integration guide](https://docs.setu.co/data/digilocker/quickstart)

---

## 2. UIDAI Aadhaar Offline e-KYC / QR — identity field verification without a live API call

**What it verifies:** That a claimed Aadhaar-derived identity (name, DOB, gender, address, masked Aadhaar number, photo) is genuinely UIDAI-issued and untampered — useful for KYC and any scheme document that embeds an Aadhaar QR.

**Access model — this is the one genuinely free, no-partnership item on this list:**
- The Aadhaar **QR code** (on the physical card, e-Aadhaar, and mAadhaar) and the **Offline e-KYC XML** (a citizen-downloaded, password-protected ZIP) are both **digitally signed by UIDAI** using a certificate UIDAI publishes publicly.
- Because the signature is verifiable against UIDAI's **published public key**, verification can be done **entirely offline — no API call to UIDAI is required at all.** You parse the QR/XML, check the digital signature against UIDAI's certificate, and you have cryptographic proof the data wasn't altered after UIDAI issued it.
- UIDAI ships an official free **Aadhaar QR Scanner** app (Android/iOS/Windows) as a reference implementation. Building your own verifier means reimplementing that signature check (well-documented; libraries exist), not calling a metered API.

**Cost / rate limits:** Free — there is no per-verification charge because there is no live call. UIDAI does separately offer online eKYC/paperless authentication requiring registration as an AUA/KUA (Authentication User Agency) — that path *is* paid/partnered and is a different, much heavier product (used for live OTP-based Aadhaar auth, not what Pramaan needs).

**Integration difficulty:** Low-Medium. Parsing the QR/XML format and validating an X.509 signature is a solved, documented problem — realistic to prototype in a hackathon if a document sample with a real Aadhaar QR is available; the code is the same regardless of whose Aadhaar it is.

**Hackathon reality: P0.** This is the single most hackathon-feasible "real" external verification on this list, because it needs no account, no key, no partner approval — only correct signature-verification code against UIDAI's public certificate.

Sources: [UIDAI — Aadhaar Paperless Offline e-KYC](https://uidai.gov.in/en/307-faqs/authentication/offline-aadhaar-data-verification-service.html) · [Aadhaar Offline eKYC / XML guide](https://www.befisc.com/fintechsherlock/aadhaar-offline-ekyc-xml-guide/) · [UIDAI Aadhaar QR Scanner — Google Play](https://play.google.com/store/apps/details?id=in.net.uidai.qrcodescanner&hl=en_IN)

---

## 3. PAN verification — Income Tax / Protean (NSDL) e-PAN

**What it verifies:** That a stated PAN exists, its status (active/inactive), and (in some flows) name-match against the cardholder — relevant for bank statements, tender bank-guarantee docs, and KYC.

**Access model:**
- Official **Protean (formerly NSDL) Online PAN Verification** is an institutional B2B product (banks, insurers, government bodies, etc.), not a public self-serve API. **Registration fee: ₹12,000/year + GST**, plus an advance-amount arrangement for volumes above a free monthly allotment. Three modes: screen-based (≤5 PANs), file-based bulk (≤1,000 PANs/batch, ~24h turnaround), and API-based.
- The Income Tax e-Filing portal has its own PAN-verification API, similarly restricted to specified categories of entities (banks, insurance, "specified persons" under the relevant notification) — not open public signup.
- **Realistic path:** third-party KYC aggregators (Sandbox.co.in, Surepass, Karza, Digio, Signzy, HyperVerge, IDfy, Deepvue) resell PAN verification on top of these official rails via their own pay-as-you-go API with an instant sandbox key. Sandbox.co.in explicitly advertises a **14-day free trial** and self-serve signup (no sales call needed) across its KYC bundle (PAN, GSTIN, Aadhaar offline, bank penny-drop, MCA). Exact per-call pricing for these aggregators is not uniformly published — most quote on request, per completed verification.

**Cost / rate limits:** Direct/official: ₹12,000/yr + GST minimum, institutional-only. Aggregators: free trial credits, then pay-per-call (rate not publicly listed by most vendors).

**Integration difficulty:** Low if using an aggregator's sandbox key (a hackathon can get a working call in under an hour); High for going direct to Protean/Income-Tax (requires being a registered financial/government entity).

**Hackathon reality:** P1 via an aggregator's free trial (Sandbox.co.in is the most explicitly "self-serve, 14-day free trial" option found); P2/P3 for the official direct route.

Sources: [Protean Online PAN Verification](https://www.tinpan.proteantech.in/online-pan-verification) · [PAN Verification API Integration Doc v1.2 (PDF)](https://tinpan.proteantech.in/downloads/online-pan-verification/downloads/PAN%20Verification%20API%20Integration%20document%20V1.2.pdf) · [Sandbox.co.in KYC API](https://sandbox.co.in/kyc) · [Sandbox pricing](https://sandbox.co.in/pricing)

---

## 4. GST / GSTIN verification

**What it verifies:** That a GSTIN on an invoice/tender document is real, its legal/trade name, registration date, status (active/cancelled), and filing history — directly useful for the trade-invoice and tender use case.

**Access model:**
- GSTIN registration data is **public information** — anyone can look up a GSTIN on the official GST portal's "Search Taxpayer" feature (`gst.gov.in`) without login, seeing legal name, state, registration date, status, taxpayer type, and constitution. Logging in unlocks a bit more (director names, e-way bill history, turnover bands).
- A programmatic **GST System API** exists via the official **GST Developer Portal** (`developer.gst.gov.in/apiportal`), but production access is gated through registered **GST Suvidha Providers (GSPs)** — an approved-intermediary model, not open public API keys.
- **Realistic path for a hackathon/MVP:** aggregators (Sandbox.co.in's "Search GSTIN API", ClearTax, and several others) wrap the public/GSP-backed lookup in a simple REST call with self-serve or free-trial keys.

**Cost / rate limits:** The manual portal lookup is free and unlimited for a human doing one-off checks (not designed for automated scraping). GSP/API-based programmatic access is a paid, approved-partner model; aggregator resale pricing again mostly quote-on-request, with free trial tiers common (Sandbox.co.in).

**Integration difficulty:** Low via an aggregator sandbox key; Medium-High to become an approved GSP directly.

**Hackathon reality:** P1 — a working GSTIN-lookup call is realistic same-day via an aggregator's free/trial tier; going direct to GSTN as a GSP is P3.

Sources: [GST Developer Portal](https://developer.gst.gov.in/apiportal/) · [GST Search Taxpayer user guide](https://tutorial.gst.gov.in/userguide/taxpayersdashboard/Search_Taxpayer_manual.htm) · [Sandbox GST API](https://sandbox.co.in/gst)

---

## 5. MCA / CIN — company registry (Ministry of Corporate Affairs, MCA21)

**What it verifies:** That a company named in a tender bid, turnover certificate, or bank-guarantee document is a real registered entity with a matching CIN, incorporation date, status (active/struck-off), and registered directors — a strong cross-check for "fake experience/turnover" tender fraud.

**Access model:**
- The official **MCA21** portal (`mca.gov.in`) provides company master data, but its programmatic/bulk API access is a **paid subscription** product, not free public API.
- No free official public API exists for automated CIN lookups at scale; several third-party providers (Surepass, Attestr, APIclub, Sandbox.co.in) wrap MCA21 master data (company + DIN/director lookups) in their own REST APIs, some advertising "no subscription" pay-per-call access built on public registry data.

**Cost / rate limits:** Official MCA21 API access is a paid institutional subscription (pricing not publicly listed per-call). Aggregator resale: pay-per-lookup, several offer instant sandbox keys.

**Integration difficulty:** Low via an aggregator; High for a direct MCA21 subscription (procurement-level commercial agreement).

**Hackathon reality:** P1 via an aggregator's trial key for spot-checking a CIN; P2 for a proper paid production integration.

Sources: [Sandbox MCA Company Master Data API](https://developer.sandbox.co.in/reference/mca-company-master-data-api) · [Surepass MCA Data API](https://surepass.io/mca-data-apis-cin-din/) · [Attestr Company Master Data API](https://docs.attestr.com/attestr-docs/company-master-data-api)

---

## 6. DGFT IEC — Import-Export Code (tender/trade-finance use case)

**What it verifies:** That an Importer-Exporter Code quoted on a trade or tender document is genuine and active — relevant to the "fake experience/turnover/bank-guarantee docs in tenders" and trade-invoice use cases.

**Access model:**
- DGFT provides an official **View/Verify IEC** lookup on `dgft.gov.in` (Services → IEC → View/Verify IEC); newer IEC certificates also carry a **QR code** for verification.
- DGFT has also enabled IEC verification integration **via DigiLocker**, per DGFT's own announcement — meaning it inherits the same DigiLocker Requester-partnership gate described in §1 for programmatic use.
- Third-party aggregators (Surepass and others) offer a wrapped "IEC Verification API."

**Cost / rate limits:** The manual DGFT portal lookup is free. No evidence of a free, open, self-serve programmatic API directly from DGFT; aggregator resale is pay-per-call (not publicly itemized).

**Integration difficulty:** Low via aggregator or manual QR check; Medium-High for direct DGFT/DigiLocker programmatic access.

**Hackathon reality:** P1 for a manual/aggregator spot-check; not worth building a scraper against the DGFT portal directly (fragile, likely ToS-restricted).

Sources: [DGFT IEC Profile Management](https://www.dgft.gov.in/CP/?opt=iec-profile-management) · [DigiLocker/DGFT IEC verification announcement](https://www.facebook.com/OfficialDigiLocker/posts/importer-exporter-iec-verification-is-now-easy-and-real-time-dgft-has-made-iec-v/6274606939276437/) · [Surepass IEC Verification API](https://surepass.io/import-export-verification/)

---

## 7. Bank account verification / penny-drop

**What it verifies:** That a bank account number + IFSC quoted on a document (a forged bank statement, a bank-guarantee doc) actually resolves to a real, active account, and whether the account-holder name matches the applicant's claimed name — a strong cross-check against forged bank statements.

**Access model:** This is the most commercially mature category. Established Indian payment/fintech infra providers offer it as a standard, self-serve REST API:
- **Razorpay** (Bank Account Validation / RazorpayX) — validates account + IFSC, returns holder name/account type/bank; covers ~99% of Indian bank accounts; the verification amount is auto-refunded.
- **Cashfree Payments** (Reverse Penny Drop) — ₹1 verification request, auto-credited back, covers 600+ banks.
- **Setu** (Reverse Penny Drop) — customer pays ₹1 to a registered VPA; Setu extracts the bank details from that UPI transaction.

**Cost / rate limits:** All three require a registered business account (standard payment-aggregator KYC) to go live; exact per-call pricing is not uniformly published in public docs (typically volume-negotiated or bundled with a payments account) — sandbox/test-mode access is generally available quickly after signup for development.

**Integration difficulty:** Low-Medium once a business account exists (well-documented REST APIs with sandbox modes); the gating factor is business KYC to activate live payouts, not the API itself.

**Hackathon reality:** P1-P2 — a sandbox/test integration is plausible to wire up quickly if a team member already has a Razorpay/Cashfree/Setu business account; going from zero to a live business account within a 2-hour hackathon is not realistic, so treat this as "architecturally ready, demo in sandbox mode" rather than a live production check.

Sources: [Razorpay Bank Account Verification](https://razorpay.com/bank-account-verification/) · [Cashfree Penny Drop Verification](https://www.cashfree.com/penny-drop-verification/) · [Setu Reverse Penny Drop quickstart](https://docs.setu.co/data/bav/reverse-penny-drop/quickstart)

---

## 8. Sanctions & watchlists — OFAC SDN, UN Consolidated, EU Sanctions Map

**What it verifies:** Whether a named individual/entity on a document (KYC onboarding, trade invoice counterparty, tender bidder) appears on a sanctions or denied-party list — standard AML/KYC due diligence, and the one category here that is genuinely free at the official source.

**Access model:**
- **OFAC (US Treasury)** publishes its **SDN List** and **Consolidated (non-SDN) List** as free, structured, machine-readable downloads via its own **Sanctions List Service (SLS)**, including a "Customize Sanctions Dataset" tool and a public Sanctions List Search app — no API key, no account, no cost.
- **UN Security Council** publishes its **Consolidated Sanctions List** as free public XML/JSON on its own site.
- **EU** publishes its **Consolidated Financial Sanctions List** and the separate **EU Sanctions Map** (for non-asset-freeze measures) as free public data; **OpenSanctions.org** aggregates the EU Sanctions Map (and many other lists) into one normalized, queryable dataset.
- Numerous commercial screening vendors (Sanction Scanner and others) wrap these same official free lists in a hosted fuzzy-matching API for a fee — useful for name-matching quality, not for the underlying data itself, which is already free.

**Cost / rate limits:** Official source data (OFAC, UN, EU) is free with no published rate limit for bulk/file download — the constraint is you must build your own fuzzy name-matching, since raw list downloads only give exact structured records, not a match-scoring API. Commercial wrappers charge for the matching layer.

**Integration difficulty:** Low-Medium — download the official lists (updated periodically, so needs a refresh job), load into a local index, and do fuzzy string matching (e.g. Levenshtein/Jaro-Winkler) against extracted document names. Entirely buildable without any vendor.

**Hackathon reality: P0-P1.** Genuinely realistic to prototype in a hackathon: pull OFAC's SDN CSV/XML once, do a simple fuzzy-match against a name extracted from the document, and surface "possible sanctions-list name match — verify manually" as a flag. Good, honest, low-effort addition.

Sources: [OFAC Sanctions List Service](https://ofac.treasury.gov/sanctions-list-service) · [OFAC SDN List](https://sanctionslist.ofac.treas.gov/Home/SdnList) · [OFAC Consolidated List](https://sanctionslist.ofac.treas.gov/Home/ConsolidatedList) · [OpenSanctions — EU Sanctions Map dataset](https://www.opensanctions.org/datasets/eu_sanctions_map/) · [EU Sanctions Map](https://www.sanctionsmap.eu/)

---

## 9. WHOIS / domain age

**What it verifies:** For the "universal" use case (fake vendor websites, phishing-adjacent trade fraud, marketplace listings) — how old a claimed company's domain is; a brand-new domain behind an established-sounding "10-year-old export firm" is a real red flag.

**Access model:** Multiple commercial WHOIS/RDAP API vendors offer generous free tiers:
- **WhoisJSON** — free plan: **1,000 requests/month**, 20 req/min, includes RDAP-derived domain-age fields for supported TLDs.
- **WhoisFreaks** — new accounts get **500 free API credits**, with modest per-minute rate limits.
- **WhoisXML API** — has a free tier and a documented high per-second limit for paid tiers.

**Cost / rate limits:** Free tiers above are sufficient for a hackathon demo's volume; production use at scale would need a paid plan (pricing varies by vendor, generally per-lookup credit packs).

**Integration difficulty:** Low — plain REST call, JSON response, no approval process, sign up with email.

**Hackathon reality: P0.** Straightforward to wire up in minutes with any of the above free-tier keys.

Sources: [WhoisJSON free plan](https://whoisjson.com/free-domain-api) · [WhoisFreaks free tier / rate limits](https://whoisfreaks.com/products/whois-api) · [WhoisXML API rate limits](https://whois.whoisxmlapi.com/documentation/limits)

---

## 10. Reverse image search

**What it verifies:** Whether a photo, stamp, seal, or signature image on a document has been seen elsewhere on the web — catching a template/stamp image reused across many fraudulent applications, or a stock photo used as a "genuine" signature/photo. Called out explicitly in `docs/PRODUCT.md`'s roadmap as a planned capability.

**Access model:**
- **Google Cloud Vision — Web Detection** is the realistic API path (there is no general-purpose free "Google reverse image search API"; Web Detection is Google's productized equivalent, and it does search against Google Image Search's index). **First 1,000 units/month free**, then **$3.50 per 1,000 units** after that.
- **TinEye** offers free reverse search *only* on its own consumer website (manual, one image at a time, not an automatable API); its **commercial API starts at $200/month**, aimed at bulk/automated use — not a free-tier developer option.

**Cost / rate limits:** Google Cloud Vision Web Detection: 1,000 free/month, then $3.50/1,000 — genuinely usable for a hackathon demo within the free tier. TinEye API has no meaningful free programmatic tier.

**Integration difficulty:** Low — Google Cloud Vision is a standard REST/SDK call once a GCP project + API key exists; the free monthly quota is enough for live demo use.

**Hackathon reality: P0-P1** for Google Cloud Vision Web Detection specifically (free quota covers a demo), assuming a GCP project can be spun up in the time available; **not P0** for TinEye (no usable free API tier).

Sources: [Google Cloud Vision pricing](https://cloud.google.com/vision/pricing) · [TinEye API pricing](https://blog.tineye.com/new-image-search-pricing/) · [TinEye API](https://services.tineye.com/TinEyeAPI)

---

## Priority summary

| # | Source | What it checks | Tier | Cost at entry level | Approval needed? |
|---|---|---|---|---|---|
| 2 | UIDAI Aadhaar QR/Offline XML signature | Identity fields genuinely UIDAI-issued | **P0** | Free (offline signature check) | No |
| 8 | OFAC / UN / EU sanctions lists | Name on a watchlist | **P0** | Free (official downloads) | No |
| 9 | WHOIS / domain age | Domain age of a claimed business | **P0** | Free tier (500–1,000 lookups/mo) | No (email signup) |
| 10 | Google Cloud Vision Web Detection | Reused stamp/photo/signature image | **P0/P1** | Free (1,000/mo), then $3.50/1,000 | No (GCP account) |
| 3 | PAN verification | PAN exists / active | **P1** | Aggregator free trial, then pay-per-call | Aggregator signup only |
| 4 | GSTIN verification | GST registration exists/active | **P1** | Aggregator free trial, then pay-per-call | Aggregator signup only |
| 5 | MCA / CIN company registry | Company legally registered | **P1** | Aggregator pay-per-call | Aggregator signup only |
| 6 | DGFT IEC | Import-export code active | **P1** | Aggregator pay-per-call / manual QR check | Aggregator signup only |
| 7 | Bank account penny-drop | Account exists, holder name matches | **P1/P2** | Sandbox mode ~free; live needs biz KYC | Payment-aggregator business account |
| 1 | DigiLocker / e-District MP | Certificate matches issuer's own record | **P3** | Not publicly listed | DigiLocker Requester approval (govt-level for e-District) |

**Recommendation for this build:** ship §2, §8, §9, §10 first — they require no partner approval and materially strengthen `externalChecksNeeded` into real PASS/FAIL/WARN checks without changing the "honest architecture" promise in `docs/PRODUCT.md`. Everything in §1–§7 stays correctly described as a roadmap item, not something the hackathon build should claim to have done.

---

*Compiled 2026-09-20. Vendor pricing and API terms change — re-verify against the source URLs above before quoting a number in a pitch deck or committing to an integration.*
