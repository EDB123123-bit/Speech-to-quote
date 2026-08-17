import type { ExtractionResult } from '@/lib/ai/schemas';
import { reconcileExtraction } from '@/lib/quotes/reconcile';
import type { CatalogItem } from '@/lib/supabase/types';

export type ExtractionOutcome = {
  extraction: ExtractionResult;
  usedFallback: boolean;
  error?: unknown;
};

/**
 * The catalog is structured data owned by the contractor, so it is also a
 * safe deterministic fallback when the model is unavailable or malformed.
 * This keeps obvious mentions such as "20 m² dekpannen" from becoming an
 * empty quote while still surfacing the provider failure in observability.
 */
export async function extractWithCatalogFallback(args: {
  transcript: string;
  catalog: CatalogItem[];
  extract: (transcript: string, catalog: CatalogItem[]) => Promise<ExtractionResult>;
}): Promise<ExtractionOutcome> {
  try {
    const modelResult = await args.extract(args.transcript, args.catalog);
    return {
      extraction: reconcileExtraction(args.transcript, modelResult, args.catalog),
      usedFallback: false,
    };
  } catch (error) {
    return {
      extraction: reconcileExtraction(args.transcript, { tasks: [], clarifications: [] }, args.catalog),
      usedFallback: true,
      error,
    };
  }
}
