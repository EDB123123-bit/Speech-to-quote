'use client';

import { useState } from 'react';
import type { LineClassification, QuoteLineItem, QuoteVatCategory, QuoteVatRate } from '@/lib/supabase/types';
import { formatEuros, summarizePricing, toTotalsInput } from '@/lib/money/totals';
import { removeLineItem } from '@/app/offertes/[id]/line-item-actions';

export { toTotalsInput };

type Props = {
  items: QuoteLineItem[];
  onChange: (items: QuoteLineItem[]) => void;
  readOnly?: boolean;
};

export default function LineItemsEditor({ items, onChange, readOnly }: Props) {
  const pricing = summarizePricing(items);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  function patch(id: string, changes: Partial<QuoteLineItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  async function remove(item: QuoteLineItem) {
    setRemovingId(item.id);
    setRemoveError(null);
    try {
      await removeLineItem(item.id);
      onChange(items.filter((candidate) => candidate.id !== item.id));
    } catch {
      setRemoveError('Verwijderen mislukt. Probeer opnieuw.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="line-items">
        {items.map((item, index) => {
          const unpriced = item.unit_price_cents === null;
          const lineKind = item.line_kind ?? 'detailed';
          const incomplete = item.unit_price_cents !== null && item.vat_rate === null;
          const unclassified = item.classification === 'unclassified' || item.classification == null;
          const needsReview = unpriced || incomplete || unclassified;
          const lineTotal = item.unit_price_cents === null
            ? null
            : Math.round((lineKind === 'simple' ? 1 : item.quantity ?? 0) * item.unit_price_cents);
          return (
            <details
              key={item.id}
              open={items.length === 1 || index === 0}
              className={`line-item ${needsReview ? 'needs-work' : ''}`}
            >
              <summary className="line-summary">
                <span>
                  <span className="line-description">{item.description || 'Nieuwe offertelijn'}</span>
                  {incomplete ? (
                    <span className="status-pill is-warning mt-2">Btw ontbreekt</span>
                  ) : unpriced ? (
                    <span className="status-pill is-warning mt-2">Prijs toevoegen / verifiëren</span>
                  ) : (
                    <span className="line-meta">{lineKind === 'simple' ? 'Totaalprijs' : `${item.quantity ?? '—'} ${item.unit ?? ''} ×`} {formatEuros(item.unit_price_cents!)} · {item.vat_category === 'AE' ? 'btw verlegd' : `${item.vat_rate === 0.06 ? '6%' : '21%'} btw`}{item.price_source === 'historical_suggestion' ? ' · Voorgesteld op basis van eerdere offerte' : ''}</span>
                  )}
                  {unclassified && <span className="status-pill is-warning mt-2">Soort werk nakijken</span>}
                </span>
                <span className="line-total">{lineTotal === null ? 'Onbekend' : formatEuros(lineTotal)}</span>
              </summary>

              <div className="line-edit-fields">
                <label className="label line-edit-title flex flex-col gap-2">
                  Omschrijving
                  <input
                    aria-label="Omschrijving"
                    value={item.description}
                    disabled={readOnly}
                    onChange={(e) => patch(item.id, { description: e.target.value })}
                    className="field text-ink"
                  />
                </label>
                <label className="label line-field-quantity flex flex-col gap-1">
                  Aantal {lineKind === 'simple' && <span className="font-medium text-muted">— eenvoudige lijn</span>}
                  <input
                    aria-label={`Aantal voor ${item.description}`}
                    type="number"
                    step="any"
                    value={item.quantity ?? ''}
                    placeholder="Optioneel"
                    disabled={readOnly || lineKind === 'simple'}
                    onChange={(e) => patch(item.id, { quantity: e.target.value === '' ? null : Number(e.target.value) })}
                    className="field nums text-ink"
                  />
                </label>

                <label className="label line-field-kind flex flex-col gap-1">
                  Regels
                  <select
                    aria-label={`Regeltype voor ${item.description}`}
                    value={lineKind}
                    disabled={readOnly}
                    onChange={(e) => patch(item.id, { line_kind: e.target.value as 'simple' | 'detailed', ...(e.target.value === 'simple' ? { quantity: null, unit: null } : {}) })}
                    className="field text-ink"
                  >
                    <option value="simple">Eenvoudige lijn</option>
                    <option value="detailed">Aantal en eenheid</option>
                  </select>
                </label>

                <label className="label line-field-unit flex flex-col gap-1">
                  Eenheid
                  <input
                    aria-label={`Eenheid voor ${item.description}`}
                    value={item.unit ?? ''}
                    placeholder="Optioneel"
                    disabled={readOnly || lineKind === 'simple'}
                    onChange={(e) => patch(item.id, { unit: e.target.value || null })}
                    className="field text-ink"
                  />
                </label>

                <label className="label line-field-price flex flex-col gap-1">
                  {lineKind === 'simple' ? 'Totaalprijs (€)' : 'Prijs per eenheid (€)'}
                  <input
                    aria-label={`Prijs voor ${item.description}`}
                    type="number"
                    step="0.01"
                    value={item.unit_price_cents === null ? '' : item.unit_price_cents / 100}
                    disabled={readOnly}
                    onChange={(e) =>
                      patch(item.id, {
                        unit_price_cents:
                          e.target.value === '' ? null : Math.round(Number(e.target.value) * 100),
                      })
                    }
                    className={`field nums text-ink ${unpriced ? 'needs-attention' : ''}`}
                  />
                </label>

                <label className="label flex flex-col gap-1">
                  Soort werk
                  <select
                    aria-label={`Soort werk voor ${item.description}`}
                    value={item.classification ?? 'unclassified'}
                    disabled={readOnly}
                    onChange={(e) => patch(item.id, { classification: e.target.value as LineClassification })}
                    className="field text-ink"
                  >
                    <option value="material">Materiaal</option>
                    <option value="labor_service">Arbeid of dienst</option>
                    <option value="unclassified">Nakijken</option>
                  </select>
                </label>
                <label className="label flex flex-col gap-1">
                  Btw
                  <select
                    aria-label={`Btw-tarief voor ${item.description}`}
                    value={item.vat_rate === null ? '' : item.vat_category === 'AE' ? 'AE:0' : String(item.vat_rate)}
                    disabled={readOnly}
                    onChange={(e) =>
                      patch(item.id, {
                        vat_rate: e.target.value === '' ? null : (Number(e.target.value.includes(':') ? e.target.value.split(':')[1] : e.target.value) as QuoteVatRate),
                        vat_category: e.target.value.startsWith('AE:') ? ('AE' as QuoteVatCategory) : ('S' as QuoteVatCategory),
                      })
                    }
                    className="field nums text-ink"
                  >
                    <option value="">Kies…</option>
                    <option value="0.06">6%</option>
                    <option value="0.21">21%</option>
                    <option value="AE:0">Verlegging van heffing</option>
                  </select>
                </label>
                <label className="label col-span-full flex flex-col gap-1">
                  Notitie <span className="font-medium text-muted">— mag leeg</span>
                  <textarea
                    aria-label={`Notitie voor ${item.description}`}
                    value={item.source_notes ?? ''}
                    disabled={readOnly}
                    onChange={(e) => patch(item.id, { source_notes: e.target.value || null })}
                    className="field min-h-20 text-ink"
                  />
                </label>
                {incomplete && (
                  <p className="alert alert-warning col-span-full">
                    Kies een btw-tarief voor deze geprijsde offertelijn.
                  </p>
                )}
                {unpriced && (
                  <p className="alert alert-warning col-span-full">
                    Voeg de jobprijs toe of controleer de voorgestelde prijs. Een lege prijs blijft onbekend en wordt niet als €0 gerekend.
                  </p>
                )}
                {!readOnly && (
                  <div className="line-item-actions col-span-full">
                    <button
                      type="button"
                      className="btn btn-danger"
                      disabled={removingId !== null}
                      onClick={() => void remove(item)}
                    >
                      {removingId === item.id ? 'Verwijderen…' : 'Item verwijderen'}
                    </button>
                  </div>
                )}
              </div>
            </details>
          );
        })}
      </div>

      {removeError && <p role="alert" className="alert alert-critical">{removeError}</p>}

      <div className="totals-card">
        {pricing.vatGroups.map((group) => (
          <div key={group.vatRate} data-testid={`vat-group-${group.vatRate}`}>
            <div className="totals-row"><span>{group.vatRate === 0 ? 'Werk met verlegging' : `Werk aan ${group.vatRate === 0.06 ? '6%' : '21%'} btw`}</span><span>{formatEuros(group.subtotalCents)}</span></div>
            <div className="totals-row"><span>{group.vatRate === 0 ? 'Btw verlegd' : `Btw ${group.vatRate === 0.06 ? '6%' : '21%'}`}</span><span>{formatEuros(group.vatAmountCents)}</span></div>
          </div>
        ))}
        <div className="totals-grand">
          <strong>{pricing.state === 'fully_priced' ? 'Totaal incl. btw' : pricing.state === 'partially_priced' ? 'Totaal gekende werken' : 'Totaal'}</strong>
          <strong data-testid="grand-total">
            {pricing.state === 'unpriced' ? 'Prijs nog te bepalen' : formatEuros(pricing.knownTotalCents)}
          </strong>
        </div>
        {pricing.state === 'partially_priced' && <p className="mt-2 text-sm text-muted">Het bedrag hierboven is enkel het gekende bedrag; overige werken hebben nog geen prijs.</p>}
        {pricing.state === 'unpriced' && <p className="mt-2 text-sm text-muted">De prijs voor deze werken wordt later bepaald.</p>}
      </div>
    </div>
  );
}
