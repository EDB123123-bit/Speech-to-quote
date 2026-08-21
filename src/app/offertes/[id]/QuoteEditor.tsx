'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LineItemsEditor from '@/components/LineItemsEditor';
import ClarificationPanel from '@/components/ClarificationPanel';
import CustomerForm from '@/components/CustomerForm';
import EmailQuoteForm from '@/components/EmailQuoteForm';
import { checkFinalizeGate } from '@/lib/quotes/finalize-gate';
import { calculateTotals, formatEuros, toTotalsInput } from '@/lib/money/totals';
import Icon from '@/components/ui/Icon';
import ShareQuoteButton from '@/components/ShareQuoteButton';
import QuoteMetadataForm from '@/components/QuoteMetadataForm';
import { updateLineItem, addLineItem } from '@/app/offertes/[id]/line-item-actions';
import type { LineType, MailboxSummary, Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

type Props = {
  quote: Quote;
  initialLineItems: QuoteLineItem[];
  initialClarifications: QuoteClarification[];
  mailbox?: MailboxSummary | null;
  companyName?: string;
  invoice?: { id: string; status: string; invoice_number: string | null } | null;
};

export default function QuoteEditor({
  quote,
  initialLineItems,
  initialClarifications,
  mailbox = null,
  companyName = 'je bedrijf',
  invoice = null,
}: Props) {
  const router = useRouter();
  const [lineItems, setLineItems] = useState(initialLineItems);
  const [blockerMessages, setBlockerMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [addingLineType, setAddingLineType] = useState<LineType | null>(null);
  // Set when a line item edit fails to persist to the database. The PDF is
  // rendered server-side from the DB, so an unsaved edit that the contractor
  // thinks succeeded must block finalizing rather than fail silently.
  const [saveFailed, setSaveFailed] = useState(false);

  const isFinal = quote.status === 'final';
  const blockers = checkFinalizeGate({ quote, lineItems, clarifications: initialClarifications });
  const totals = calculateTotals(toTotalsInput(lineItems));
  const pendingQuestions = initialClarifications.filter((item) => item.status === 'pending').length;
  const incompleteLines = lineItems.filter((item) => item.unit_price_cents === null || item.vat_rate === null).length;

  function onLineItemsChange(next: QuoteLineItem[]) {
    setLineItems(next);
    // Persist only the rows that actually changed.
    for (const item of next) {
      const before = lineItems.find((existing) => existing.id === item.id);
      if (!before) continue;
      const changed =
        before.description !== item.description ||
        before.source_notes !== item.source_notes ||
        before.quantity !== item.quantity ||
        before.unit !== item.unit ||
        before.unit_price_cents !== item.unit_price_cents ||
        before.vat_rate !== item.vat_rate ||
        before.vat_category !== item.vat_category;

      if (changed) {
        void updateLineItem(item.id, {
          description: item.description,
          source_notes: item.source_notes,
          quantity: item.quantity,
          unit: item.unit,
          unit_price_cents: item.unit_price_cents,
          vat_rate: item.vat_rate,
          vat_category: item.vat_category,
        })
          .then(() => setSaveFailed(false))
          .catch(() => setSaveFailed(true));
      }
    }
  }

  async function finalize() {
    setBusy(true);
    setBlockerMessages([]);
    try {
      const response = await fetch(`/api/quotes/${quote.id}/finalize`, { method: 'POST' });
      const body = await response.json();

      if (!response.ok) {
        setBlockerMessages(
          body.blockers?.map((b: { messageNl: string }) => b.messageNl) ?? [
            body.error ?? 'Afwerken mislukt.',
          ],
        );
        return;
      }
      router.refresh();
    } catch {
      setBlockerMessages(['Geen verbinding. Probeer opnieuw.']);
    } finally {
      setBusy(false);
    }
  }

  async function addLine(lineType: LineType) {
    setAddingLineType(lineType);
    setSaveFailed(false);

    try {
      const item = await addLineItem(quote.id, lineType);
      setLineItems((current) => [...current, item]);
    } catch {
      setSaveFailed(true);
    } finally {
      setAddingLineType(null);
    }
  }

  async function retryProcessing() {
    setRetrying(true);
    setBlockerMessages([]);
    try {
      const response = await fetch(`/api/quotes/${quote.id}/retry`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) {
        setBlockerMessages([body.error ?? 'Opnieuw toepassen mislukt.']);
        return;
      }
      router.refresh();
    } catch {
      setBlockerMessages(['Geen verbinding. Probeer opnieuw.']);
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="quote-workspace">
      <div className="quote-main">
        {quote.transcript && (
          <details className="card text-sm">
            <summary className="cursor-pointer text-base font-bold">Wat ik gehoord heb</summary>
            <p className="mt-3 leading-relaxed text-ink">{quote.transcript}</p>
          </details>
        )}

        {!isFinal && (
          <ClarificationPanel
            quoteId={quote.id}
            clarifications={initialClarifications}
            onResolved={() => router.refresh()}
          />
        )}

        {!isFinal && lineItems.length === 0 && (quote.transcript || quote.audio_path) && (
          <section className="alert alert-warning flex-col items-start gap-3">
            <div>
              <strong>Er zijn nog geen offertelijnen.</strong>
              <p className="mt-1">Ik kan de opname opnieuw verwerken en de prijslijst toepassen zonder opnieuw op te nemen.</p>
            </div>
            <button type="button" onClick={() => void retryProcessing()} disabled={retrying} className="btn btn-outline">
              {retrying ? 'Prijslijst toepassen…' : 'Prijslijst opnieuw toepassen'}
            </button>
          </section>
        )}

        <section>
          <p className="eyebrow">Offertelijnen</p>
          <LineItemsEditor items={lineItems} onChange={onLineItemsChange} readOnly={isFinal} />

          {!isFinal && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" onClick={() => void addLine('materials')} disabled={addingLineType !== null} className="btn btn-quiet">
                <Icon name="plus" size={19} /> {addingLineType === 'materials' ? 'Bezig…' : 'Materiaal toevoegen'}
              </button>
              <button type="button" onClick={() => void addLine('labor')} disabled={addingLineType !== null} className="btn btn-quiet">
                <Icon name="plus" size={19} /> {addingLineType === 'labor' ? 'Bezig…' : 'Arbeid toevoegen'}
              </button>
              <button type="button" onClick={() => void addLine('combined')} disabled={addingLineType !== null} className="btn btn-quiet">
                <Icon name="plus" size={19} /> {addingLineType === 'combined' ? 'Bezig…' : 'Gecombineerd toevoegen'}
              </button>
            </div>
          )}
        </section>
      </div>

      <aside className="quote-sidebar">
        {isFinal ? (
          <div className="ready-card">
            <span className="ready-icon"><Icon name="check" size={28} /></span>
            <h2>Offerte is klaar</h2>
            <p>{quote.customer_name ?? 'Klant'} · {formatEuros(totals.grandTotalCents)} incl. btw</p>
          </div>
        ) : (
          <><QuoteMetadataForm quote={quote} /><CustomerForm quote={quote} /></>
        )}

        {saveFailed && (
          <p role="alert" className="alert alert-critical">
            Een offertelijn kon niet opgeslagen worden. Controleer je verbinding en probeer opnieuw.
          </p>
        )}

        {blockerMessages.length > 0 && (
          <ul role="alert" className="alert alert-critical flex-col">
            {blockerMessages.map((message) => <li key={message}>{message}</li>)}
          </ul>
        )}

        {isFinal ? (
          <>
            <section className="quote-sidebar-card">
              <h2 className="section-heading">Offerte delen</h2>
              <div className="flex flex-col gap-2">
              <ShareQuoteButton quoteId={quote.id} customerName={quote.customer_name} />
              <a href={`/api/quotes/${quote.id}/pdf`} className="btn btn-outline w-full">
                <Icon name="download" size={21} /> Pdf downloaden
              </a>
              {invoice ? (
                <Link href={`/facturen/${invoice.id}`} className="btn btn-accent w-full">{invoice.status === 'draft' ? 'Factuurconcept verder nakijken' : `Factuur ${invoice.invoice_number ?? ''} bekijken`}</Link>
              ) : (
                <Link href={`/facturen/nieuw?quote=${quote.id}`} className="btn btn-accent w-full">Factuur maken</Link>
              )}
              </div>
            </section>
            <EmailQuoteForm quote={quote} companyName={companyName} mailbox={mailbox} />
          </>
        ) : (
          <div className="sticky-action">
            {blockers.length > 0 && (
              <p className="task-summary">
                Nog te doen: {[
                  pendingQuestions ? `${pendingQuestions} ${pendingQuestions === 1 ? 'vraag' : 'vragen'}` : '',
                  incompleteLines ? `${incompleteLines} ${incompleteLines === 1 ? 'prijs' : 'prijzen'}` : '',
                  blockers.some((blocker) => blocker.code.includes('customer')) ? 'klantgegevens' : '',
                ].filter(Boolean).join(', ')}.
              </p>
            )}
            <button type="button" onClick={() => void finalize()} disabled={busy || blockers.length > 0 || saveFailed} className="btn btn-primary w-full">
              {busy ? 'Bezig…' : `Offerte afwerken · ${formatEuros(totals.grandTotalCents)}`}
            </button>
          </div>
        )}

        {!isFinal && blockers.length > 0 && (
          <ul className="text-sm font-medium leading-relaxed text-muted">
            {blockers.map((blocker) => <li key={blocker.code}>• {blocker.messageNl}</li>)}
          </ul>
        )}
      </aside>
    </div>
  );
}
