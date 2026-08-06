import { z } from 'zod';

export const ExtractedTaskSchema = z.object({
  catalogItemId: z.string().nullable(),
  description: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string().min(1),
});

export const ClarificationSchema = z.object({
  questionNl: z.string().min(1),
});

export const ExtractionResultSchema = z.object({
  tasks: z.array(ExtractedTaskSchema),
  clarifications: z.array(ClarificationSchema),
});

export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/** Strips a ```json fence if the model wrapped its reply in one. */
export function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fenced ? fenced[1].trim() : trimmed;
}
