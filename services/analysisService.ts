import type { AnalysisReport } from "../types";
import { DEMO_REPORTS } from "./demoReport";

/**
 * Converts a File into a base64 string with the "data:...;base64," prefix stripped.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Returns the full data URL (e.g. "data:image/png;base64,...") for a File.
 * Used for image thumbnails/preview.
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Sends a document to the backend for authenticity/fraud analysis.
 */
export async function analyzeDocument(file: File): Promise<AnalysisReport> {
  const fileBase64 = await fileToBase64(file);

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileBase64,
      mediaType: file.type || "image/png",
      fileName: file.name,
    }),
  });

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(json?.error || "Analysis failed");
  }

  return json.report as AnalysisReport;
}

/**
 * Loads a pre-built, fully-populated FICTIONAL sample report for demo purposes
 * (e.g. when no ANTHROPIC_API_KEY is configured, so the live pipeline cannot
 * run). Adds a short artificial delay so the existing scanning animation in
 * FileUpload still plays, matching the feel of a real analysis.
 */
export async function loadDemoReport(kind: "genuine" | "tampered"): Promise<AnalysisReport> {
  await new Promise((resolve) => setTimeout(resolve, 1400));
  return DEMO_REPORTS[kind];
}
