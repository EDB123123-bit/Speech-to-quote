'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import LineItemsEditor from '@/components/LineItemsEditor';
import ClarificationPanel from '@/components/ClarificationPanel';
import CustomerForm from '@/components/CustomerForm';
import { checkFinalizeGate } from '@/lib/quotes/finalize-gate';
import { updateLineItem, addLineItem } from '@/app/offertes/[id]/line-item-actions';
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

type Props = {
  quote: Quote;
  initialLineItems: QuoteLineItem[];
  initialClarifications: QuoteClarification[];
};

export default function QuoteEditor({ quote, initialLineItems, initialClarifications }: Props) {
  const router = useRouter();
  const [lineItems, setLineItems] = useState(initialLineItems);
  const [blockerMessages, setBlockerMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  // Set when a line item edit fails to persist to the database. The PDF is
  // rendered server-side from the DB, so an unsaved edit that the contractor
  // thinks succeeded must block finalizing rather than fail silently.
  const [saveFailed, setSaveFailed] = useState(false);

  const isFinal = quote.status === 'final';
  const blockers = checkFinalizeGate({ quote, lineItems, clarifications: initialClarifications });

  function onLineItemsChange(next: QuoteLineItem[]) {
    setLineItems(next);
    // Persist only the rows that actually changed.
    for (const item of next) {
      const before = lineItems.find((existing) => existing.id === item.id);
      if (!before) continue;
      const changed =
        before.description !== item.description ||
        before.quantity !== item.quantity ||
        before.unit !== item.unit ||
        before.unit_price_cents !== item.unit_price_cents ||
        before.vat_rate !== item.vat_rate;

      if (changed) {
        void updateLineItem(item.id, {
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unit_price_cents: item.unit_price_cents,
          vat_rate: item.vat_rate,
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

  return (
    <div className="flex flex-col gap-6">
      {quote.transcript && (
        <details className="rounded border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Wat ik gehoord heb</summary>
          <p className="mt-2 text-gray-700">{quote.transcript}</p>
        </details>
      )}

      {!isFinal && (
        <ClarificationPanel
          quoteId={quote.id}
          clarifications={initialClarifications}
          onResolved={() => router.refresh()}
        />
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Offertelijnen</h2>
        <LineItemsEditor items={lineItems} onChange={onLineItemsChange} readOnly={isFinal} />

        {!isFinal && (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() =>
                void addLineItem(quote.id, 'materials')
                  .then(() => {
                    setSaveFailed(false);
                    router.refresh();
                  })
                  .catch(() => setSaveFailed(true))
              }
              className="rounded border px-3 py-2 text-sm"
            >
              + Materiaal toevoegen
            </button>
            <button
              type="button"
              onClick={() =>
                void addLineItem(quote.id, 'labor')
                  .then(() => {
                    setSaveFailed(false);
                    router.refresh();
                  })
                  .catch(() => setSaveFailed(true))
              }
              className="rounded border px-3 py-2 text-sm"
            >
              + Arbeid toevoegen
            </button>
          </div>
        )}
      </section>

      {!isFinal && <CustomerForm quote={quote} />}

      {saveFailed && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          Een offertelijn kon niet opgeslagen worden. Controleer je verbinding en probeer opnieuw.
        </p>
      )}

      {blockerMessages.length > 0 && (
        <ul role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {blockerMessages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      {isFinal ? (
        <a
          href={`/api/quotes/${quote.id}/pdf`}
          className="rounded bg-black p-4 text-center text-white"
        >
          Pdf downloaden
        </a>
      ) : (
        <button
          type="button"
          onClick={() => void finalize()}
          disabled={busy || blockers.length > 0 || saveFailed}
          className="rounded bg-black p-4 text-white disabled:opacity-50"
        >
          {busy ? 'Bezig…' : 'Offerte afwerken'}
        </button>
      )}

      {!isFinal && blockers.length > 0 && (
        <ul className="text-sm text-gray-600">
          {blockers.map((blocker) => (
            <li key={blocker.code}>• {blocker.messageNl}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
