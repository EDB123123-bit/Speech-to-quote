import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import QuotesList, { type QuoteListItem } from '@/components/QuotesList';
import Icon from '@/components/ui/Icon';
import { summarizePricing } from '@/lib/money/totals';
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';
import { quoteImportEnabled } from '@/lib/quote-imports/constants';

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

  const { count: pendingReviewCount } = quoteImportEnabled()
    ? await supabase
        .from('quote_import_documents')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'ready_for_review')
    : { count: 0 };

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
      issueDate: quote.issue_date ?? quote.created_at.slice(0, 10),
      quoteNumber: quote.quote_number ?? quote.id.split('-')[0].toUpperCase(),
      status: quote.status,
      quoteKind: quote.quote_kind ?? 'standard',
      totalCents: (() => { const pricing = summarizePricing(items); return pricing.state === 'unpriced' ? null : pricing.knownTotalCents; })(),
      pricingState: summarizePricing(items).state,
      openQuestions: openQuestionsByQuote.get(quote.id) ?? 0,
    };
  });

  const openCount = quotes.filter((quote) => quote.status === 'draft').length;
  const startOfWeek = new Date();
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - ((startOfWeek.getDay() + 6) % 7));
  const sentThisWeek = quotes.filter(
    (quote) => (quote.status === 'sent' || quote.status === 'accepted')
      && new Date(quote.sent_at ?? quote.created_at) >= startOfWeek,
  ).length;

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">{contractor.company_name}</p>
          <h1 className="page-title">Offertes</h1>
          <p className="page-subtitle">{openCount} open · {sentThisWeek} verstuurd deze week</p>
        </div>
      </header>

      <Link href="/offertes/nieuw" className="hero-cta mb-7" data-tour="new-quote">
        <span className="hero-cta-icon"><Icon name="microphone" size={30} /></span>
        <span>
          <strong>Nieuwe offerte</strong>
          <small>Spreek de klus in</small>
        </span>
      </Link>

      {(pendingReviewCount ?? 0) > 0 && (
        <Link href="/offertes/importeren" className="alert alert-warning mb-7 flex items-center justify-between gap-3">
          <span>
            <strong>{pendingReviewCount} geïmporteerde {pendingReviewCount === 1 ? 'offerte wacht' : 'offertes wachten'} op nakijken</strong>
            <small className="block">Ze worden pas een concept nadat je ze hebt gecontroleerd.</small>
          </span>
          <Icon name="chevron-right" size={20} />
        </Link>
      )}

      {quoteImportEnabled() && (
        <Link href="/offertes/importeren" className="btn btn-outline mb-7 w-full" data-tour="quote-pdf-import">
          <Icon name="file" size={21} /> PDF-offertes importeren
        </Link>
      )}

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
