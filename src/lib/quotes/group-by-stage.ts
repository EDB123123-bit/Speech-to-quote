import type { PipelineStage, Quote } from '@/lib/supabase/types';

export type QuoteWithTotal = Quote & { grandTotalCents: number };

export type GroupedQuotes = {
  concept: QuoteWithTotal[];
  afgewerkt: QuoteWithTotal[];
  byStage: Map<string, QuoteWithTotal[]>;
};

export function groupQuotesByStage(
  quotes: QuoteWithTotal[],
  stages: PipelineStage[],
): GroupedQuotes {
  const validStageIds = new Set(stages.map((s) => s.id));
  const byStage = new Map<string, QuoteWithTotal[]>(stages.map((s) => [s.id, []]));
  const concept: QuoteWithTotal[] = [];
  const afgewerkt: QuoteWithTotal[] = [];

  for (const q of quotes) {
    if (q.status === 'draft') {
      concept.push(q);
      continue;
    }

    if (q.pipeline_stage_id && validStageIds.has(q.pipeline_stage_id)) {
      byStage.get(q.pipeline_stage_id)!.push(q);
    } else {
      afgewerkt.push(q);
    }
  }

  return { concept, afgewerkt, byStage };
}
