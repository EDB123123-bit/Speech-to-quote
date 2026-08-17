import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import QuotesList, { type QuoteListItem } from '@/components/QuotesList';
import Icon from '@/components/ui/Icon';
import { calculateTotals, toTotalsInput } from '@/lib/money/totals';
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export default async function QuotesPage() {
  const { supabase, contractor } = await requireContractor();
  const { data } = await supabase
    .from('quotes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  const quotes = (data ?? []) as Quote[];
  const quoteIds = quotes.map((quote) => quote.id);
  const [{ data: lineItemRows }, { data: clarificationRows }] = quoteIds.length > 0
    ? await Promise.all([
        supabase.from('quote_line_items').select('*').in('quote_id', quoteIds),
        supabase.from('quote_clarifications').select('*').in('quote_id', quoteIds),
      ])
    : [{ data: [] }, { data: [] }];

  const lineItemsByQuote = new Map<string, QuoteLineItem[]>();
  for (const item of (lineItemRows ?? []) as QuoteLineItem[]) {
    lineItemsByQuote.set(item.quote_id, [...(lineItemsByQuote.get(item.quote_id) ?? []), item]);
  }
  const openQuestionsByQuote = new Map<string, number>();
  for (const clarification of (clarificationRows ?? []) as QuoteClarification[]) {
    if (clarification.status === 'pending') {
      openQuestionsByQuote.set(
        clarification.quote_id,
        (openQuestionsByQuote.get(clarification.quote_id) ?? 0) + 1,
      );
    }
  }

  const listItems: QuoteListItem[] = quotes.map((quote) => {
    const items = lineItemsByQuote.get(quote.id) ?? [];
    return {
      id: quote.id,
      customerName: quote.customer_name ?? 'Nog geen klantnaam',
      place: placeFromAddress(quote.customer_address),
      createdAt: quote.created_at,
      status: quote.status,
      totalCents: calculateTotals(toTotalsInput(items)).grandTotalCents,
      openQuestions: openQuestionsByQuote.get(quote.id) ?? 0,
    };
  });

  const openCount = quotes.filter((quote) => quote.status === 'draft').length;
  const startOfWeek = new Date();
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const sentThisWeek = quotes.filter(
    (quote) => quote.status === 'final' && new Date(quote.created_at) >= startOfWeek,
  ).length;

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">{contractor.company_name}</p>
          <h1 className="page-title">Offertes</h1>
          <p className="page-subtitle">{openCount} open · {sentThisWeek} afgewerkt deze week</p>
        </div>
      </header>

      <Link href="/offertes/nieuw" className="hero-cta mb-7">
        <span className="hero-cta-icon"><Icon name="microphone" size={30} /></span>
        <span>
          <strong>Nieuwe offerte</strong>
          <small>Spreek de klus in</small>
        </span>
      </Link>

      {quotes.length === 0 ? (
        <div className="empty-state">
          <strong>Nog geen offertes</strong>
          Maak je eerste offerte door de klus in te spreken.
        </div>
      ) : (
        <QuotesList quotes={listItems} />
      )}
    </main>
  );
}

function placeFromAddress(address: string | null): string {
  if (!address) return '';
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? address;
}
