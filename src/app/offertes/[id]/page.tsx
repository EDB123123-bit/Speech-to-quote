import { notFound } from 'next/navigation';
import { requireContractor } from '@/lib/auth/require-contractor';
import { getMailboxSummary } from '@/lib/mailbox/connection';
import QuoteEditor from './QuoteEditor';
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, contractor } = await requireContractor();

  const [{ data: quote }, { data: lineItems }, { data: clarifications }, mailbox] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', id).single(),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('sort_order'),
    supabase.from('quote_clarifications').select('*').eq('quote_id', id).order('created_at'),
    getMailboxSummary(contractor.id),
  ]);

  if (!quote) notFound();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-2xl font-bold">
        Offerte {(quote as Quote).id.split('-')[0].toUpperCase()}
      </h1>
      <p className="mb-6 text-sm text-gray-600">
        {(quote as Quote).status === 'final' ? 'Afgewerkt' : 'Concept'}
      </p>

      <QuoteEditor
        quote={quote as Quote}
        initialLineItems={(lineItems ?? []) as QuoteLineItem[]}
        initialClarifications={(clarifications ?? []) as QuoteClarification[]}
        mailbox={mailbox}
        companyName={contractor.company_name}
      />
    </main>
  );
}
