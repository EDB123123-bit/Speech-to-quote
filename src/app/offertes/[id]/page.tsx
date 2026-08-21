import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import { getMailboxSummary } from '@/lib/mailbox/connection';
import DeleteQuoteButton from '@/components/DeleteQuoteButton';
import QuoteEditor from './QuoteEditor';
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';
import Icon from '@/components/ui/Icon';

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, contractor } = await requireContractor();

  const [{ data: quote }, { data: lineItems }, { data: clarifications }, { data: invoice }, mailbox] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', id).single(),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('sort_order'),
    supabase.from('quote_clarifications').select('*').eq('quote_id', id).order('created_at'),
    supabase.from('invoices').select('id, status, invoice_number').eq('quote_id', id).eq('document_type', 'invoice').maybeSingle(),
    getMailboxSummary(contractor.id),
  ]);

  if (!quote) notFound();

  const typedQuote = quote as Quote;

  return (
    <main className="page-shell">
      <Link href="/offertes" className="back-link"><Icon name="arrow-left" /> Terug naar offertes</Link>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{typedQuote.status === 'final' ? 'Afgewerkte offerte' : 'Concept nakijken'}</p>
          <h1 className="page-title">{typedQuote.customer_name ?? `Offerte ${typedQuote.quote_number ?? typedQuote.id.split('-')[0].toUpperCase()}`}</h1>
          <p className="page-subtitle">
            {typedQuote.status === 'final' ? 'Klaar om te versturen' : 'Controleer de werken, prijzen en klantgegevens.'}
          </p>
        </div>
        <span className={`badge ${typedQuote.status === 'final' ? 'badge-success' : 'badge-neutral'}`}>
          {typedQuote.status === 'final' ? 'Afgewerkt' : 'Concept'}
        </span>
      </header>

      <QuoteEditor
        quote={typedQuote}
        initialLineItems={(lineItems ?? []) as QuoteLineItem[]}
        initialClarifications={(clarifications ?? []) as QuoteClarification[]}
        mailbox={mailbox}
        companyName={contractor.company_name}
        invoice={invoice as { id: string; status: string; invoice_number: string | null } | null}
      />
      <div className="mt-7 flex justify-end">
        <DeleteQuoteButton quoteId={typedQuote.id} redirectTo="/offertes" />
      </div>
    </main>
  );
}
