import type { createServerSupabase } from '@/lib/supabase/server';
import type { QuoteLineItem } from '@/lib/supabase/types';
import { findHistoricalPriceSuggestion, type HistoricalPriceCandidate } from './historical-suggestions';

type DbClient = Awaited<ReturnType<typeof createServerSupabase>>;

export async function loadHistoricalPriceCandidates(supabase: DbClient, contractorId: string, excludeQuoteId?: string): Promise<HistoricalPriceCandidate[]> {
  let quoteQuery = supabase.from('quotes').select('id,created_at').eq('contractor_id', contractorId);
  if (excludeQuoteId) quoteQuery = quoteQuery.neq('id', excludeQuoteId);
  const { data: quotes } = await quoteQuery.limit(500);
  const ids = (quotes ?? []).map((quote: { id: string }) => quote.id);
  if (!ids.length) return [];
  const { data: lines } = await supabase.from('quote_line_items').select('description,unit,unit_price_cents,classification,line_type,quote_id').in('quote_id', ids);
  const dates = new Map((quotes ?? []).map((quote: { id: string; created_at: string }) => [quote.id, quote.created_at]));
  return ((lines ?? []) as Array<Record<string, unknown>>)
    .filter((line) => typeof line.unit_price_cents === 'number' && (line.unit_price_cents as number) >= 0)
    .map((line) => ({
      description: String(line.description ?? ''), unit: (line.unit as string | null) ?? null,
      unitPriceCents: line.unit_price_cents as number,
      classification: (line.classification as HistoricalPriceCandidate['classification']) ?? null,
      lineType: line.line_type as HistoricalPriceCandidate['lineType'], quoteId: line.quote_id as string,
      createdAt: dates.get(line.quote_id as string) ?? null,
    }));
}

export function applyHistoricalSuggestions<T extends Pick<QuoteLineItem, 'description' | 'unit' | 'classification' | 'unit_price_cents' | 'price_source'>>(rows: T[], candidates: HistoricalPriceCandidate[]): T[] {
  return rows.map((row) => {
    if (row.unit_price_cents !== null) return row;
    const suggestion = findHistoricalPriceSuggestion({ description: row.description, unit: row.unit, classification: row.classification ?? null, candidates });
    return suggestion ? { ...row, unit_price_cents: suggestion.unitPriceCents, price_source: suggestion.source } : row;
  });
}
