import type { LineClassification, LineType, QuotePriceSource } from '@/lib/supabase/types';

export type HistoricalPriceCandidate = {
  description: string;
  unit: string | null;
  unitPriceCents: number;
  classification: LineClassification | null;
  lineType?: LineType;
  createdAt?: string | null;
  quoteId?: string | null;
};

export type Suggestion = { unitPriceCents: number; source: Extract<QuotePriceSource, 'historical_suggestion'> };

export function normalizeSuggestionText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLocaleLowerCase('nl-BE').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function candidateClassification(candidate: HistoricalPriceCandidate): LineClassification | null {
  if (candidate.classification) return candidate.classification;
  if (candidate.lineType === 'materials') return 'material';
  if (candidate.lineType === 'labor') return 'labor_service';
  return 'unclassified';
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const left = new Set(a.split(' ').filter(Boolean));
  const right = new Set(b.split(' ').filter(Boolean));
  if (!left.size || !right.size) return 0;
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / (left.size + right.size - overlap);
}

export function findHistoricalPriceSuggestion(args: {
  description: string;
  unit: string | null;
  classification: LineClassification | null;
  candidates: HistoricalPriceCandidate[];
}): Suggestion | null {
  const description = normalizeSuggestionText(args.description);
  if (!description || !args.classification || args.classification === 'unclassified') return null;
  const unit = normalizeSuggestionText(args.unit ?? '');
  const matches = args.candidates
    .filter((candidate) => candidate.unitPriceCents >= 0 && candidateClassification(candidate) === args.classification)
    .filter((candidate) => {
      const candidateUnit = normalizeSuggestionText(candidate.unit ?? '');
      return !unit || !candidateUnit || unit === candidateUnit;
    })
    .map((candidate) => ({ candidate, score: similarity(description, normalizeSuggestionText(candidate.description)) }))
    .filter(({ score }) => score === 1 || score >= 0.75)
    .sort((a, b) => b.score - a.score || String(b.candidate.createdAt ?? '').localeCompare(String(a.candidate.createdAt ?? '')));
  const best = matches[0]?.candidate;
  return best ? { unitPriceCents: best.unitPriceCents, source: 'historical_suggestion' } : null;
}
