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
/** Hard ceiling on a single scan. The serverless function is capped at 300s, so if
 *  we are still waiting past this the request will never succeed — failing loudly
 *  beats a spinner that runs forever. */
const ANALYSIS_TIMEOUT_MS = 240_000;

export async function analyzeDocument(file: File): Promise<AnalysisReport> {
  const fileBase64 = await fileToBase64(file);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("/api/analyze", {
    signal: controller.signal,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileBase64,
      mediaType: file.type || "image/png",
      fileName: file.name,
      }),
    });
  } catch (e: unknown) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(
        "This scan took longer than four minutes and was stopped. Try a smaller or clearer image — very large scans are the usual cause.",
      );
    }
    throw new Error("Could not reach the analysis service. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 504) {
      throw new Error("The analysis timed out on the server. Try a smaller image, or retry in a moment.");
    }
    throw new Error(json?.error || "Analysis failed");
  }

  return json.report as AnalysisReport;
}
