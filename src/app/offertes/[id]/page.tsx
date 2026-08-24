import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import { getMailboxSummary } from '@/lib/mailbox/connection';
import DeleteQuoteButton from '@/components/DeleteQuoteButton';
import QuoteEditor from './QuoteEditor';
import type { GmailQuoteImport, Quote, QuoteAttachment, QuoteClarification, QuoteLineItem, QuoteTask } from '@/lib/supabase/types';
import Icon from '@/components/ui/Icon';
import QuoteFamilyPanel from '@/components/QuoteFamilyPanel';
import { summarizePricing } from '@/lib/money/totals';

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, contractor } = await requireContractor();

  const [{ data: quote }, { data: lineItems }, { data: clarifications }, { data: tasks }, { data: legacyInvoice }, { data: sourceLink }, { data: gmailImport }, { data: attachments }, mailbox] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', id).single(),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('sort_order'),
    supabase.from('quote_clarifications').select('*').eq('quote_id', id).order('created_at'),
    supabase.from('quote_tasks').select('*').eq('quote_id', id).order('created_at'),
    supabase.from('invoices').select('id, status, invoice_number').eq('quote_id', id).eq('document_type', 'invoice').maybeSingle(),
    supabase.from('invoice_quote_sources').select('invoice_id').eq('quote_id', id).maybeSingle(),
    supabase.from('gmail_quote_imports').select('*').eq('quote_id', id).maybeSingle(),
    supabase.from('quote_attachments').select('*').eq('quote_id', id).order('created_at'),
    getMailboxSummary(contractor.id),
  ]);

  if (!quote) notFound();
  const { data: linkedInvoice } = !legacyInvoice && sourceLink
    ? await supabase.from('invoices').select('id, status, invoice_number').eq('id', sourceLink.invoice_id).maybeSingle()
    : { data: null };
  const invoice = legacyInvoice ?? linkedInvoice;

  const typedQuote = quote as Quote;
  const [{ data: childRows }, { data: parentRow }] = await Promise.all([
    supabase.from('quotes').select('*').eq('parent_quote_id', id).order('created_at'),
    typedQuote.parent_quote_id
      ? supabase.from('quotes').select('id, quote_number, customer_name').eq('id', typedQuote.parent_quote_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const childQuotes = (childRows ?? []) as Quote[];
  const childIds = childQuotes.map((child) => child.id);
  const { data: childLines } = childIds.length
    ? await supabase.from('quote_line_items').select('*').in('quote_id', childIds)
    : { data: [] };
  const childLineMap = new Map<string, QuoteLineItem[]>();
  for (const item of (childLines ?? []) as QuoteLineItem[]) childLineMap.set(item.quote_id, [...(childLineMap.get(item.quote_id) ?? []), item]);
  const statusCopy = {
    draft: { eyebrow: 'Concept nakijken', subtitle: 'Controleer de werken, prijzen en klantgegevens.', badge: 'Concept', className: 'badge-neutral' },
    final: { eyebrow: 'Afgewerkte offerte', subtitle: 'Klaar om te versturen', badge: 'Afgewerkt', className: 'badge-final' },
    sent: { eyebrow: 'Verstuurde offerte', subtitle: 'Wacht op aanvaarding door de klant.', badge: 'Verstuurd', className: 'badge-warning' },
    accepted: { eyebrow: 'Aanvaarde offerte', subtitle: 'De offerte is aanvaard en blijft ongewijzigd.', badge: 'Aanvaard', className: 'badge-success' },
  }[typedQuote.status];

  return (
    <main className="page-shell">
      <Link href="/offertes" className="back-link"><Icon name="arrow-left" /> Terug naar offertes</Link>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{statusCopy.eyebrow}</p>
          <h1 className="page-title">{typedQuote.customer_name ?? `Offerte ${typedQuote.quote_number ?? typedQuote.id.split('-')[0].toUpperCase()}`}</h1>
          <p className="page-subtitle">
            {statusCopy.subtitle}
          </p>
        </div>
        <span className={`badge ${statusCopy.className}`}>
          {statusCopy.badge}
        </span>
      </header>

      <QuoteFamilyPanel
        quote={typedQuote}
        parent={(parentRow ?? null) as Pick<Quote, 'id' | 'quote_number' | 'customer_name'> | null}
        changeOrders={childQuotes.map((child) => ({ quote: child, pricing: summarizePricing(childLineMap.get(child.id) ?? []) }))}
        originalPricing={summarizePricing((lineItems ?? []) as QuoteLineItem[])}
      />

      {gmailImport && <GmailSourcePanel importRecord={gmailImport as GmailQuoteImport} attachments={(attachments ?? []) as QuoteAttachment[]} />}

      <QuoteEditor
        quote={typedQuote}
        initialLineItems={(lineItems ?? []) as QuoteLineItem[]}
        initialClarifications={(clarifications ?? []) as QuoteClarification[]}
        initialTasks={(tasks ?? []) as QuoteTask[]}
        isGmailImport={Boolean(gmailImport)}
        mailbox={mailbox}
        companyName={contractor.company_name}
        invoice={invoice as { id: string; status: string; invoice_number: string | null } | null}
      />
      {typedQuote.status === 'draft' && (
        <div className="mt-7 flex justify-end">
          <DeleteQuoteButton quoteId={typedQuote.id} redirectTo="/offertes" />
        </div>
      )}
    </main>
  );
}

function GmailSourcePanel({ importRecord, attachments }: { importRecord: GmailQuoteImport; attachments: QuoteAttachment[] }) {
  return <section className="card mb-6">
    <details open>
      <summary className="cursor-pointer font-bold">Bron: Gmail-aanvraag</summary>
      <div className="mt-4 grid gap-2 text-sm text-muted">
        <p><strong className="text-ink">Afzender:</strong> {importRecord.sender}</p>
        <p><strong className="text-ink">Onderwerp:</strong> {importRecord.subject}</p>
        <p><strong className="text-ink">Ontvangen:</strong> {new Intl.DateTimeFormat('nl-BE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(importRecord.received_at))}</p>
        <p><strong className="text-ink">Gmail-referentie:</strong> {importRecord.gmail_message_id}</p>
        {attachments.length > 0 && <div><strong className="text-ink">Bijlagen:</strong><ul className="mt-2 flex flex-col gap-1">{attachments.map((attachment) => <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-2"><span>{attachment.filename} · {attachment.processing_status === 'unsupported' ? 'Niet automatisch verwerkt' : attachment.processing_status}</span><a className="font-bold underline" href={`/api/quote-attachments/${attachment.id}`}>Download</a></li>)}</ul></div>}
        <div className="mt-3 border-t border-line pt-4">
          <p className="font-bold text-ink">E-mailbericht</p>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-ink">{importRecord.body_text}</p>
        </div>
      </div>
    </details>
  </section>;
}
