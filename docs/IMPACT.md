# Pramaan — Impact & Go-to-Market Case

**Scope:** the fiscal case, who benefits, how we'd measure it, how we'd roll it out starting in Madhya Pradesh, and how it sustains itself. Every figure below is either (a) a cited public number, or (b) explicitly labeled an estimate/assumption with the arithmetic shown. Nothing here is presented as a measured result of Pramaan itself — Pramaan has not yet run in production against real government volumes.

---

## 1. The fiscal problem

Document fraud in welfare, scholarship, and tender flows is not a hypothetical — it is a documented, recurring pattern in Indian public administration, including in Madhya Pradesh specifically.

**National scale, from government's own reporting:**
- The Direct Benefit Transfer (DBT) programme — India's primary mechanism for weeding out fake and duplicate welfare beneficiaries via Aadhaar-linked verification — has saved a cumulative **₹3.48 lakh crore (~US$42 billion)** by removing leakage, per the Union IT Minister. In FY2022-23 alone, DBT savings were **₹63,000+ crore**, up from ₹50,000 crore in FY22. [Akashvani/News on Air](https://newsonair.gov.in/direct-benefit-transfer-initiative-saved-%E2%82%B93-48-lakh-cr-by-reducing-leakages-it-minister/), [DBT Bharat — Estimated Gains](https://dbtbharat.gov.in/static-page-content/spagecont?id=18)
- That leakage-removal exercise identified and purged **5.2 crore fake ration cards**, **4.1 crore duplicate LPG connections**, and **2.1+ crore ineligible beneficiaries** (income-tax filers, government employees who didn't qualify) from welfare rolls nationally. [DBT Bharat](https://dbtbharat.gov.in/static-page-content/spagecont?id=18)
- DBT today covers **1.5 billion+ (non-unique) beneficiary transactions annually across 320+ central schemes** — the base rate at which even a small residual fraud percentage translates into large absolute rupee figures. [Global Alliance Against Hunger and Poverty](https://globalallianceagainsthungerandpoverty.org/country-example/india-direct-benefit-transfer-dbt/)

**Important caveat on the DBT number:** the bulk of DBT's savings came from Aadhaar-based *identity* deduplication (removing ghost/duplicate people), not from *document*-level forensic checks (catching a tampered income or caste certificate). Pramaan targets a different, complementary failure mode — the document itself is fabricated or altered even when the applicant is a real, unique person. We cite the DBT number to establish that leakage at this scale is real and government-acknowledged, not to claim Pramaan would capture the same ₹3.48 lakh crore.

**Scholarship-specific document fraud, at national scale:**
- In the 2022–23 cycle, of **25.5 lakh scholarship applications** reviewed, **more than 6.7 lakh (≈26%) were found fake** — a document/eligibility fraud rate, not an identity-duplication rate. [Search result summary; underlying case coverage via CaseMine/news aggregation]
- A Ministry of Minority Affairs audit found **830 of 1,572 reviewed minority institutions were fake or inactive**, associated with **₹144.83 crore** in scholarship misuse over five years. 
- Localized cases show the same pattern at smaller scale: in one Kashmir scheme audit, **463 of 474 claimed beneficiaries were fake**, with ₹1.34 crore already disbursed; in Hoshiarpur, Punjab, 62 fake applications were caught under a minority scholarship scheme across two academic years.

**Madhya Pradesh, specifically — fake caste certificates in the civil service pipeline:**
- A Gwalior investigation uncovered **25 government employees** who had secured their jobs using fake caste certificates. [Free Press Journal](https://www.freepressjournal.in/bhopal/madhya-pradesh-fake-caste-certificate-fraud-unearthed-in-gwalior)
- State-wide, **over 1,000 government employees** are under investigation for allegedly using fraudulent caste certificates to secure posts or reservations, including **600+ Class I officers**; as of the most recent reporting, investigations into roughly 90% of these cases remained incomplete, and most accused continued in their posts. [HR Katha](https://www.hrkatha.com/news/1000-govt-workers-under-probe-for-fake-caste-claims-in-madhya-pradesh/), [ETV Bharat](https://www.etvbharat.com/en/!state/several-employees-in-madhya-pradesh-continue-jobs-with-fraudulent-caste-certificates-amid-slow-investigations-enn24122505291)

**What this establishes, honestly:** we do not have — and are not claiming — a single audited "₹X crore lost to fake documents in MP welfare schemes per year" figure; no such consolidated public number appears to exist. What the above *does* establish, from government's own admissions and investigative reporting, is that (1) document/eligibility fraud in Indian welfare and public-employment pipelines is large enough that the union government invested in a multi-lakh-crore national programme to fight one slice of it, (2) MP specifically has an open, acknowledged, and *stalled* caste-certificate fraud problem in exactly the pipeline Pramaan targets, and (3) scholarship fraud rates in the ~25–30% range are documented at national scale. A conservative, clearly-labeled estimate: if MP's own scheme volumes (scholarships, caste/income/domicile certificates, PDS, tender eligibility docs) run into the tens of lakhs of documents per year, even a low single-digit-percent tampering rate implies thousands of fraudulent claims and crores of rupees in misdirected benefit — but this is our extrapolation, not a cited MP-specific total, and should be labeled as such in any pitch.

## 2. Who benefits

| Stakeholder | Benefit |
|---|---|
| **Genuine citizens / honest applicants** | Faster processing (less manual scrutiny delay for clean documents); a fair shot at limited scholarship/quota slots that fraudulent claims would otherwise consume; fewer wrongful rejections caused by scanning artifacts being mistaken for tampering, since Pramaan's flags are evidence-linked rather than "computer says no." |
| **Front-desk / scheme officers** | A structured, evidence-backed triage signal (verdict + red flags + bounding boxes) in seconds instead of unaided eyeballing under time pressure; a defensible paper trail for why a document was escalated. |
| **The state exchequer** | Fewer subsidy/scholarship/quota rupees paid against fabricated documents; better-targeted enforcement — investigators can prioritize the highest-risk flagged cases instead of sampling blindly. |
| **Tender-issuing departments** | Faster and more consistent screening of bidder-submitted turnover certificates, bank guarantees, and experience letters — currently a manual, low-throughput check that fraud specifically exploits. |
| **Banks / KYC teams, HR, landlords/marketplaces (universal use case)** | The same engine, self-serve, without any government integration required — a second, non-government revenue line (see §5). |

## 3. KPIs — what we'd actually measure (post-pilot, not claimed today)

These are the metrics a pilot needs to report before any scale-up decision — deliberately framed as *questions the pilot must answer*, not numbers we already have:

- **Fraud-catch rate**: of documents flagged SUSPICIOUS/LIKELY_FAKE by Pramaan, what fraction are confirmed fraudulent on manual investigation? (Target to validate, not assume: track precision explicitly — a screening tool with a high false-positive rate erodes officer trust fast.)
- **False-positive rate**: of genuine documents flagged, what fraction were wrongly escalated? This is the single most important trust metric for officer adoption — must be tracked from pilot day one, reported separately from the fraud-catch rate, and driven down before any expansion decision.
- **Officer time per document**: current manual-review time vs. time-to-verdict with Pramaan in the loop (target: under ~15 seconds to render a verdict per FR of PRODUCT.md, but officer *decision* time — reading the report and acting — is the metric that matters, not raw API latency).
- **Turnaround time for the applicant**: days from submission to final decision, before vs. after.
- **Escalation-to-resolution time**: for documents flagged for manual review, how long until an officer actually closes the case (this tells you whether Pramaan is helping or just adding a queue).
- **Coverage / uptake**: % of a scheme's total document volume actually routed through Pramaan during the pilot (adoption is not automatic — officers need to trust and use it).

None of these numbers exist yet for Pramaan specifically. They are the deliverable of Phase 1 below, not a pre-launch claim.

## 4. Phased rollout

**Phase 0 — Hackathon build (today):** working end-to-end pipeline (upload → deterministic signal extraction → Claude analysis → structured report), no government integration, self-serve only. This is what exists right now.

**Phase 1 — Single-scheme, single-department pilot (target: 1 scheme, 1 district or division, 3–6 months):**
- Pick one high-volume, high-fraud-signal scheme with a *human already in the loop* as a safety net — e.g. post-matric scholarship document verification at a district Social Justice / Tribal Welfare office, where fake income/caste certificates are the documented failure mode (§1).
- Pramaan runs as a **decision-support tool alongside existing manual review**, not a replacement — every verdict is advisory; no automatic rejection. This is essential both ethically (avoiding wrongful denial of a genuine benefit) and practically (it's the only way to measure real precision/recall against outcomes officers already have to determine anyway).
- Instrument the KPIs in §3 from day one. Success gate for Phase 2: a documented, positive fraud-catch rate with a false-positive rate low enough that officers report the tool as net-time-saving, not net-additional-work.

**Phase 2 — District-wide, multi-scheme (6–12 months):**
- Expand to the full document set at one district office: caste/income/domicile certificates, marksheets for scholarship verification, PDS-linked bank statements.
- Begin the **DigiLocker / e-District integration** conversation: MP already has live e-District DigiLocker integrations for some document classes (RCMS land records are confirmed live; other document types vary in reliability — see [RTI Wiki's 2026 issuer-reality review](https://righttoinformation.wiki/digilocker-issuer-reality-india-2026), which notes MP marksheets for older years frequently fail to resolve). Where a certificate carries a verifiable e-District application number, the goal is to turn today's `externalChecksNeeded` output (Pramaan's honest "this needs a live lookup we didn't do" flag — see PRODUCT.md §4.6) into an actual PASS/FAIL by querying the e-District API directly, rather than relying on visual/metadata analysis alone.
- This phase is where the product's honesty architecture pays off operationally: Pramaan already tells the officer *which* claims still need external confirmation, so the integration roadmap is demand-driven by real flagged cases, not speculative.

**Phase 3 — State-wide (12–24 months):**
- Roll out to all districts for the schemes validated in Phase 1–2.
- Officer dashboard (queue view, filter by verdict/severity, audit trail) — already on the PRODUCT.md roadmap — becomes necessary at this volume.
- Evaluate extension to tender-document screening (turnover certificates, bank guarantees, experience letters) for MP government procurement, a distinct but structurally similar fraud surface.
- Nationwide/other-state replication is a plausible Phase 4 but out of scope for this document — MP is the proving ground.

**What we are explicitly not promising:** a fixed calendar timeline with dates, or that DigiLocker/e-District integration will land in Phase 2 on schedule — that depends entirely on government API access and data-sharing agreements that are outside Pramaan's control and haven't been initiated. The phase gates above are outcome-gated (hit the KPI bar, then proceed), not date-gated.

## 5. Business & sustainability model

Two tracks, deliberately separated so government adoption doesn't depend on unlocking government procurement cycles before the product can sustain itself:

**Track A — Government SaaS + per-verification (primary, MP-focused):**
- A department/scheme office licenses Pramaan as decision support, priced as a **small per-document verification fee** (à la carte, so cost scales with actual usage/volume rather than a large upfront license the state has to budget for blind) **plus an optional flat platform/SaaS fee** covering dashboard access, audit-trail storage, and support.
- This mirrors how India's existing e-governance document infrastructure is typically procured (departments pay for verification/authentication services at the transaction level, e.g. e-KYC per-check pricing models used elsewhere in the DBT ecosystem) — a familiar procurement shape for a government buyer, not a novel ask.
- Government pricing in India for a pilot-stage vendor is typically negotiated per-MoU/pilot rather than published; we are not asserting a specific rupee figure here because none has been negotiated.

**Track B — Universal self-serve (secondary, funds product development independent of government sales cycles):**
- Banks/NBFCs (KYC document screening), HR/recruiting (degree/experience certificate checks), landlords and marketplaces (ID/ownership document checks), and individual citizens (self-check before submission) can use Pramaan today, with no government integration required, via a simple pay-per-scan or subscription model.
- This track is important for sustainability specifically *because* government sales cycles are slow and Phase 1 pilots take months to validate (§4) — Track B revenue and usage data can fund and de-risk the product while Track A's government relationship is still being built.

**Cost side, honestly:** the dominant marginal cost per verification is the Claude API call (vision + reasoning over a document) plus incidental storage/compute — a cost structure that scales roughly linearly with volume, which is why per-verification pricing (rather than a flat unlimited-use license) is the fiscally conservative default until real volume and margin data exist from Phase 1.

## 6. What would break this case (risks to the impact thesis, honestly stated)

- **False positives are the real adoption risk.** If Pramaan wrongly flags a meaningful share of genuine documents, officers will route around it (or, worse, wrongfully deny genuine applicants) — this is why §3 insists false-positive rate is tracked and reported *before* any scale decision, not after.
- **The national DBT savings figure is not transferable evidence of Pramaan's impact.** It is cited to establish that leakage-fighting at scale is fiscally significant and government-prioritized in India, not as a number Pramaan can claim credit for or extrapolate a share of.
- **No MP-specific fake-document fiscal total exists publicly** that we could find; the case above is built from adjacent, credible, cited data points (national DBT leakage, national scholarship fraud rates, MP's own open caste-certificate investigations) plus a clearly labeled extrapolation, not a single authoritative "MP loses ₹X crore/year to document fraud" statistic. Any pitch using this document should preserve that distinction.
- **DigiLocker/e-District integration depth varies by document type and is outside Pramaan's control** — some MP document classes already resolve reliably via existing state integrations, others (e.g., older marksheets) reportedly do not, per third-party reporting cited above. Phase 2 timing depends on this, not on Pramaan's own engineering.

---

*Sources are linked inline throughout. Figures without a citation are explicitly labeled as this document's own estimate or extrapolation and should not be quoted as sourced fact.*
