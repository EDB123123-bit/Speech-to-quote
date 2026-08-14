import { notFound } from 'next/navigation';
import { requireContractor } from '@/lib/auth/require-contractor';
import DeleteQuoteButton from '@/components/DeleteQuoteButton';
import QuoteEditor from './QuoteEditor';
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireContractor();

  const [{ data: quote }, { data: lineItems }, { data: clarifications }] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', id).single(),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('sort_order'),
    supabase.from('quote_clarifications').select('*').eq('quote_id', id).order('created_at'),
  ]);

  if (!quote) notFound();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-2 text-3xl font-semibold">
        Offerte {(quote as Quote).id.split('-')[0].toUpperCase()}
      </h1>
      <div className="mb-6 flex items-center justify-between gap-3">
        <span className={`badge inline-flex ${(quote as Quote).status === 'final' ? 'badge-success' : 'badge-neutral'}`}>
          {(quote as Quote).status === 'final' ? 'Afgewerkt' : 'Concept'}
        </span>
        <DeleteQuoteButton quoteId={(quote as Quote).id} redirectTo="/offertes" />
      </div>

      <QuoteEditor
        quote={quote as Quote}
        initialLineItems={(lineItems ?? []) as QuoteLineItem[]}
        initialClarifications={(clarifications ?? []) as QuoteClarification[]}
      />
    </main>
  );
}
