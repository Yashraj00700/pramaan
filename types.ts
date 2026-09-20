export type Verdict = 'AUTHENTIC' | 'SUSPICIOUS' | 'LIKELY_FAKE';
export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';
export type CheckStatus = 'PASS' | 'FAIL' | 'WARN';

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
  box: [number, number, number, number]; // box = [ymin,xmin,ymax,xmax] normalized 0-1000, origin top-left
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
}

export interface ScanRecord {
  id: string;
  createdAt: number;
  fileName: string;
  mediaType: string;
  thumbnail?: string;
  report: AnalysisReport;
}
