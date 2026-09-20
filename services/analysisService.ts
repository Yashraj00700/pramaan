import type { AnalysisReport } from "../types";

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
