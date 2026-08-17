import { requireContractor } from '@/lib/auth/require-contractor';
import { calculateTotals, toTotalsInput } from '@/lib/money/totals';
import type { PipelineStage, Quote, QuoteLineItem } from '@/lib/supabase/types';
import type { QuoteWithTotal } from '@/lib/quotes/group-by-stage';
import KanbanBoard from '@/components/kanban/KanbanBoard';

export default async function PijplijnPage() {
  const { supabase } = await requireContractor();

  const [{ data: quotes }, { data: stages }] = await Promise.all([
    supabase.from('quotes').select('*').order('created_at', { ascending: false }),
    supabase.from('pipeline_stages').select('*').order('sort_order', { ascending: true }),
  ]);

  const quoteRows = (quotes ?? []) as Quote[];
  const quoteIds = quoteRows.map((q) => q.id);

  const { data: lineItems } =
    quoteIds.length > 0
      ? await supabase.from('quote_line_items').select('*').in('quote_id', quoteIds)
      : { data: [] as QuoteLineItem[] };

  const lineItemsByQuote = new Map<string, QuoteLineItem[]>();
  for (const item of (lineItems ?? []) as QuoteLineItem[]) {
    const list = lineItemsByQuote.get(item.quote_id) ?? [];
    list.push(item);
    lineItemsByQuote.set(item.quote_id, list);
  }

  const quotesWithTotals: QuoteWithTotal[] = quoteRows.map((quote) => ({
    ...quote,
    grandTotalCents: calculateTotals(toTotalsInput(lineItemsByQuote.get(quote.id) ?? [])).grandTotalCents,
  }));

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Opvolging</p>
          <h1 className="page-title">Pijplijn</h1>
          <p className="page-subtitle">Zie meteen welke offertes nog actie nodig hebben.</p>
        </div>
      </header>
      <KanbanBoard quotes={quotesWithTotals} stages={(stages ?? []) as PipelineStage[]} />
    </main>
  );
}
