import { z } from 'zod';
import { getAnthropic, extractionModel } from '@/lib/ai/anthropic-client';
import { ExtractedTaskSchema } from '@/lib/ai/schemas';
import { firstTextBlock, parseJsonObject } from '@/lib/ai/response';
import type { QuoteLineItem } from '@/lib/supabase/types';

export class ClarificationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ClarificationError';
  }
}

export const ClarificationAnswerSchema = z.object({
  resolved: z.boolean(),
  rephrasedQuestionNl: z.string().nullable(),
  newTasks: z.array(ExtractedTaskSchema),
  updatedLineItems: z.array(
    z.object({
      id: z.string(),
      quantity: z.number().positive().nullable().optional(),
      unitPriceCents: z.number().int().nonnegative().nullable().optional(),
    }),
  ),
});

export type ClarificationAnswer = z.infer<typeof ClarificationAnswerSchema>;

export function buildClarificationPrompt(args: {
  originalTranscript: string;
  question: string;
  answerTranscript: string;
  currentLineItems: Pick<QuoteLineItem, 'id' | 'description' | 'quantity' | 'unit'>[];
}): string {
  const lineItemLines = args.currentLineItems
    .map((item) => `- id: ${item.id} | ${item.description} | ${item.quantity} ${item.unit}`)
    .join('\n');

  return `A Flemish roofworker was asked a clarifying question about their quote and
answered out loud. Decide whether the answer actually addresses the question.

Original job description (Dutch):
"""
${args.originalTranscript}
"""

Question asked (Dutch): ${args.question}

Their spoken answer (Dutch):
"""
${args.answerTranscript}
"""

Current line items:
${lineItemLines || '(none)'}

Return ONLY a JSON object with this exact shape:
{
  "resolved": <true if the answer addresses the question, false otherwise>,
  "rephrasedQuestionNl": "<if not resolved, a shorter/clearer Dutch rephrasing; otherwise null>",
  "newTasks": [
    { "description": "<Dutch>", "quantity": <number or null>, "unit": "<unit or null>",
      "unitPriceCents": <explicit selling price or null>, "priceExplicit": <boolean>,
      "classification": "material" or "labor_service" }
  ],
  "updatedLineItems": [
    { "id": "<existing line item id>", "quantity": <number>, "unitPriceCents": <integer or null> }
  ]
}

Rules:
- Never invent prices. Missing prices remain null and are valid.
- An answer like "euh", "weet ik niet", or silence is NOT resolved.
- If the answer resolves the question but adds no work, return empty arrays.
- Only include a line item in updatedLineItems if the answer actually changes it.`;
}

export async function processClarificationAnswer(args: {
  originalTranscript: string;
  question: string;
  answerTranscript: string;
  currentLineItems: Pick<QuoteLineItem, 'id' | 'description' | 'quantity' | 'unit'>[];
}): Promise<ClarificationAnswer> {
  let response;
  try {
    response = await getAnthropic().messages.create({
      model: extractionModel(),
      max_tokens: 1500,
      messages: [{ role: 'user', content: buildClarificationPrompt(args) }],
    });
  } catch (error) {
    throw new ClarificationError('Verwerken van antwoord mislukt', { cause: error });
  }

  const text = firstTextBlock(response);
  if (!text) {
    throw new ClarificationError('Onverwacht antwoordformaat van het model');
  }

  let parsed: unknown;
  try {
    parsed = parseJsonObject(text);
  } catch (error) {
    throw new ClarificationError('Model gaf geen geldige JSON terug', { cause: error });
  }

  const result = ClarificationAnswerSchema.safeParse(parsed);
  if (!result.success) {
    throw new ClarificationError('Model-antwoord voldoet niet aan het schema', { cause: result.error });
  }
  return result.data;
}
