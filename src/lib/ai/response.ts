/**
 * Anthropic can return several content blocks for one message (for example a
 * thinking block followed by the text containing the requested JSON). Never
 * assume that the first block is the useful one.
 */
export function firstTextBlock(response: { content?: readonly unknown[] }): string | null {
  const block = response.content?.find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const value = candidate as { type?: unknown; text?: unknown };
    return value.type === 'text' && typeof value.text === 'string';
  }) as { type: 'text'; text: string } | undefined;

  return block?.text ?? null;
}

/**
 * Models occasionally wrap otherwise-valid JSON in a short sentence. We keep
 * the strict parse first, then accept only the outermost JSON object as a
 * narrowly-scoped recovery path.
 */
export function parseJsonObject(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start < 0 || end <= start) throw firstError;
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}
