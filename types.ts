export type Verdict = 'AUTHENTIC' | 'SUSPICIOUS' | 'LIKELY_FAKE';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type CheckStatus = 'PASS' | 'FAIL' | 'WARN';
export type ModuleStatus = 'PASS' | 'WARN' | 'FAIL' | 'INFO';

export interface RedFlag {
  severity: Severity;
  title: string;
  detail: string;
  evidence: string;
}

export interface ConsistencyCheck {
  check: string;
  status: CheckStatus;
  detail: string;
}

export interface ExtractedField {
  label: string;
  value: string;
}

export interface TechnicalSignal {
  label: string;
  value: string;
  concern: boolean;
}

export interface VisualMarker {
  label: string;
  severity: Severity;
  box: [number, number, number, number]; // [ymin,xmin,ymax,xmax] normalized 0-1000, origin top-left
}

/** A single check row inside a dossier module. */
export interface ForensicCheck {
  category: string;
  status: CheckStatus;
  detail: string;
}

/** One module of the deep forensic dossier (rendered as its own tab + report page). */
export interface ReportModule {
  id: string;
  title: string;
  status: ModuleStatus;
  /** 0-100 confidence/health score for this module, where higher = healthier. */
  score?: number;
  /** 2-4 paragraph analyst narrative. */
  narrative: string;
  checks: ForensicCheck[];
  findings: string[];
}

export interface TimelineEvent {
  date: string;
  event: string;
  entity: string;
  consistency: 'Consistent' | 'Inconsistent' | 'Unknown';
}

export interface RiskFactor {
  label: string;
  /** 0-100 contribution to overall risk (higher = riskier). */
  score: number;
}

export interface FraudTypology {
  name: string;
  probability: number; // 0-100
  rationale: string;
  nextSteps: string[];
}

/** One side's case in the adversarial review. */
export interface CourtArgument {
  position: 'PROSECUTION' | 'DEFENSE';
  headline: string;
  points: Array<{
    claim: string;
    evidence: string;
    weight: 'Strong' | 'Moderate' | 'Weak';
  }>;
}

/** The adjudicator's ruling after weighing both cases plus the binding code-computed facts. */
export interface CourtRuling {
  verdict: Verdict;
  riskScore: number;
  confidence: number;
  reasoning: string;
  /** Points that decided the outcome. */
  decisive: string[];
  /** Points raised but rejected, and why (this is what prevents false positives). */
  dismissed: string[];
}

export interface CourtProceedings {
  prosecution: CourtArgument;
  defense: CourtArgument;
  ruling: CourtRuling;
}

export interface AnalysisReport {
  documentType: string;
  verdict: Verdict;
  riskScore: number;
  confidence: number;
  summary: string;
  redFlags: RedFlag[];
  consistencyChecks: ConsistencyCheck[];
  extractedFields: ExtractedField[];
  technicalSignals: TechnicalSignal[];
  recommendedAction: string;
  externalChecksNeeded: string[];
  visualMarkers: VisualMarker[];

  /** ---- Deep dossier ---- */
  modules: ReportModule[];
  riskBreakdown: RiskFactor[];
  timeline: TimelineEvent[];
  fraudTypology?: FraudTypology;
  issuerIntel?: string;
  missingDocuments?: string[];
  /** Adversarial review: prosecution vs defense, adjudicated. */
  court?: CourtProceedings;
  /** Error-Level Analysis heatmap as a data URL (images only). Display-only: stripped before history is saved. */
  elaImage?: string;
  /** True while the 12-module dossier and adversarial court are still being expanded in the background. */
  dossierPending?: boolean;
  /** Set when the upload was not a document at all, so no verdict is claimed. */
  notADocument?: boolean;
}

export interface ScanRecord {
  id: string;
  createdAt: number;
  fileName: string;
  mediaType: string;
  thumbnail?: string;
  report: AnalysisReport;
}
