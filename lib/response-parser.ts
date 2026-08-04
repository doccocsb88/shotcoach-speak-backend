export function extractResponseText(response: { output_text?: string | null }) {
  const text = response.output_text?.trim();
  if (!text) {
    throw new Error("OpenAI response did not contain output_text.");
  }

  return text;
}

export function parseJsonFromResponseText<T>(text: string): T {
  const normalized = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  return JSON.parse(normalized) as T;
}
