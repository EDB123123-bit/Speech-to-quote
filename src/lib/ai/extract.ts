import { getAnthropic } from '@/lib/ai/anthropic-client';
import { ExtractionResultSchema, type ExtractionResult } from '@/lib/ai/schemas';
import { firstTextBlock, parseJsonObject } from '@/lib/ai/response';

export class ExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExtractionError';
  }
}

export function buildExtractionPrompt(transcript: string, _legacyCatalog?: unknown): string {
  void _legacyCatalog;
  return `You extract quote line items from a Flemish roofworker's spoken job description.

The transcript is Dutch (Flemish), often informal, and may contain dialect or
trade jargon. Numbers may be written as words ("tachtig vierkante meter" = 80 m²).

Transcript:
"""
${transcript}
"""

Return ONLY a JSON object, no prose, with this exact shape:
{
  "tasks": [
    { "description": "<short Dutch description>",
      "quantity": <number or null>,
      "unit": "<unit, e.g. m², m, stuk> or null",
      "unitPriceCents": <explicit selling price in cents or null>,
      "priceExplicit": <true only when the contractor spoke a selling price>,
      "classification": "material" or "labor_service" }
  ],
  "clarifications": [
    { "questionNl": "<a short question in Dutch>" }
  ]
}

Rules for tasks:
- One entry per distinct work item. Do NOT split one item into separate material
  and labour rows.
- Use classification "material" only for physical goods that may later be ordered.
  Use "labor_service" for work, installation, removal, transport, inspection, or
  any other service.
- Never invent prices. Set unitPriceCents to null and priceExplicit to false when
  no selling price was spoken. An explicit spoken zero is valid and must remain 0.
- quantity and unit are nullable. Leave them null when the contractor did not say
  them; never invent a quantity, unit, or placeholder value.
- For a simple line with an explicit total price, put that total in unitPriceCents
  and leave quantity and unit null.

Rules for clarifications:
- Ask a short, specific Dutch question when a quantity or scope is genuinely
  needed to describe the work, but do not ask for a price merely because it is
  missing: unpriced quotes are valid.
- Each question must be answerable out loud by a contractor standing on a roof.
- Return an empty array if nothing is unclear.`;
}

async function requestExtraction(prompt: string): Promise<ExtractionResult> {
  const response = await getAnthropic().messages.create({
    model: process.env.EXTRACTION_MODEL ?? 'claude-sonnet-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = firstTextBlock(response);
  if (!text) throw new ExtractionError('Onverwacht antwoordformaat van het model');

  let parsed: unknown;
  try {
    parsed = parseJsonObject(text);
  } catch (error) {
    throw new ExtractionError('Model gaf geen geldige JSON terug', { cause: error });
  }

  const result = ExtractionResultSchema.safeParse(parsed);
  if (!result.success) {
    throw new ExtractionError('Model-antwoord voldoet niet aan het schema', { cause: result.error });
  }
  return result.data;
}

export async function extractQuoteTasks(transcript: string, _legacyCatalog?: unknown): Promise<ExtractionResult> {
  void _legacyCatalog;
  const prompt = buildExtractionPrompt(transcript);

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
