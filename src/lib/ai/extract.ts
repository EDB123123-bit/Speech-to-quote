import { getAnthropic } from '@/lib/ai/anthropic-client';
import { ExtractionResultSchema, type ExtractionResult } from '@/lib/ai/schemas';
import { firstTextBlock, parseJsonObject } from '@/lib/ai/response';
import type { CatalogItem } from '@/lib/supabase/types';

export class ExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExtractionError';
  }
}

export function buildExtractionPrompt(transcript: string, catalog: CatalogItem[]): string {
  const catalogLines = catalog
    .map(
      (item) =>
        `- id: ${item.id} | name: ${item.name} | unit: ${item.unit} | vat: ${item.vat_rate}`,
    )
    .join('\n');

  return `You extract quote line items from a Flemish roofworker's spoken job description.

The transcript is Dutch (Flemish), often informal, and may contain dialect or
trade jargon. Numbers may be written as words ("tachtig vierkante meter" = 80 m²).

The contractor's price catalog:
${catalogLines || '(empty)'}

Transcript:
"""
${transcript}
"""

Return ONLY a JSON object, no prose, with this exact shape:
{
  "tasks": [
    { "catalogItemId": "<id from the catalog, or null>",
      "description": "<short Dutch description of the task>",
      "quantity": <number>,
      "unit": "<unit, e.g. m², m, stuk>" }
  ],
  "clarifications": [
    { "questionNl": "<a short question in Dutch>" }
  ]
}

Rules for "tasks":
- One entry per distinct task or material mentioned. Do NOT split materials and
  labour — that happens downstream.
- Match to a catalog item by MEANING, not exact wording ("pannen leggen" matches
  "Dakpannen leggen (kleitegels)"). Use that item's id.
- If nothing in the catalog fits, set catalogItemId to null and describe the task
  in Dutch. Never invent a catalog id that is not listed above.
- Never invent prices. You are not given prices and must not guess them.
- quantity must be a positive number. If a quantity was not stated, do not guess —
  omit the task and raise a clarification instead.

Rules for "clarifications" — raise one when:
- A quantity was mentioned without a material, or a material without a quantity.
- A commonly required companion item for a mentioned task was not mentioned
  (e.g. a new gutter usually also needs downpipes and brackets; a roof
  replacement often involves onderdak or isolatie).
- A word looks like a transcription error or does not parse as a real material
  or quantity.
Each question must be short, specific, in Dutch, and answerable out loud by a
contractor standing on a roof. Return an empty array if nothing is unclear.`;
}

async function requestExtraction(prompt: string): Promise<ExtractionResult> {
  const response = await getAnthropic().messages.create({
    // Resolved inline (mirroring transcribe.ts) rather than via an
    // `extractionModel()` import: the test's vi.mock('@/lib/ai/anthropic-client', ...)
    // replaces the whole module, so a second named export would be undefined
    // across that boundary.
    model: process.env.EXTRACTION_MODEL ?? 'claude-sonnet-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = firstTextBlock(response);
  if (!text) {
    throw new ExtractionError('Onverwacht antwoordformaat van het model');
  }

  let parsed: unknown;
  try {
    parsed = parseJsonObject(text);
  } catch (error) {
    throw new ExtractionError('Model gaf geen geldige JSON terug', { cause: error });
  }

  const result = ExtractionResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new ExtractionError('Model-antwoord voldoet niet aan het schema', {
      cause: result.error,
    });
  }
  return result.data;
}

export async function extractQuoteTasks(
  transcript: string,
  catalog: CatalogItem[],
): Promise<ExtractionResult> {
  const prompt = buildExtractionPrompt(transcript, catalog);

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await requestExtraction(prompt);
    } catch (error) {
      lastError = error;
      if (attempt < 2 && process.env.NODE_ENV !== 'test') {
        await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 250));
      }
    }
  }

  throw new ExtractionError('Extractie mislukt na opnieuw proberen', { cause: lastError });
}
