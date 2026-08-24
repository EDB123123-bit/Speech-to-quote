import type { ExtractionResult } from '@/lib/ai/schemas';
import { reconcileExtraction } from '@/lib/quotes/reconcile';

export type ExtractionOutcome = {
  extraction: ExtractionResult;
  usedFallback: boolean;
  error?: unknown;
};

/** Extraction fallback that never reads or applies the contractor catalogue. */
export async function extractWithCatalogFallback(args: {
  transcript: string;
  extract: (transcript: string) => Promise<ExtractionResult>;
}): Promise<ExtractionOutcome> {
  try {
    const modelResult = await args.extract(args.transcript);
    return {
      extraction: reconcileExtraction(args.transcript, modelResult),
      usedFallback: false,
    };
  } catch (error) {
    return {
      extraction: reconcileExtraction(args.transcript, { tasks: [], clarifications: [] }),
      usedFallback: true,
      error,
    };
  }
}
