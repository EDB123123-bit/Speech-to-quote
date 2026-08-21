'use client';

import type { QuoteLineItem, QuoteVatCategory, QuoteVatRate } from '@/lib/supabase/types';
import { calculateTotals, formatEuros, toTotalsInput } from '@/lib/money/totals';

export { toTotalsInput };

type Props = {
  items: QuoteLineItem[];
  onChange: (items: QuoteLineItem[]) => void;
  readOnly?: boolean;
};

export default function LineItemsEditor({ items, onChange, readOnly }: Props) {
  const totals = calculateTotals(toTotalsInput(items));

  function patch(id: string, changes: Partial<QuoteLineItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="line-items">
        {items.map((item, index) => {
          const incomplete = item.unit_price_cents === null || item.vat_rate === null;
          const lineTotal = item.unit_price_cents === null
            ? null
            : Math.round(item.quantity * item.unit_price_cents);
          return (
            <details
              key={item.id}
              open={items.length === 1 || index === 0}
              className={`line-item ${incomplete ? 'needs-work' : ''}`}
            >
              <summary className="line-summary">
                <span>
                  <span className="line-description">{item.description || 'Nieuwe offertelijn'}</span>
                  {incomplete ? (
                    <span className="status-pill is-warning mt-2">Prijs of btw ontbreekt</span>
                  ) : (
                    <span className="line-meta">{item.quantity} {item.unit} × {formatEuros(item.unit_price_cents!)} · {item.vat_category === 'AE' ? 'btw verlegd' : `${item.vat_rate === 0.06 ? '6%' : '21%'} btw`}</span>
                  )}
                </span>
                <span className="line-total">{lineTotal === null ? 'Invullen' : formatEuros(lineTotal)}</span>
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
                <label className="label flex flex-col gap-1">
                  Aantal
                  <input
                    aria-label={`Aantal voor ${item.description}`}
                    type="number"
                    step="any"
                    value={item.quantity}
                    disabled={readOnly}
                    onChange={(e) => patch(item.id, { quantity: Number(e.target.value) })}
                    className="field nums text-ink"
                  />
                </label>

                <label className="label flex flex-col gap-1">
                  Eenheid
                  <input
                    aria-label={`Eenheid voor ${item.description}`}
                    value={item.unit}
                    disabled={readOnly}
                    onChange={(e) => patch(item.id, { unit: e.target.value })}
                    className="field text-ink"
                  />
                </label>

                <label className="label flex flex-col gap-1">
                  Prijs per eenheid (€)
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
                    className="field nums text-ink"
                  />
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
                    Vul prijs en btw-tarief aan voordat je de offerte afwerkt.
                  </p>
                )}
              </div>
            </details>
          );
        })}
      </div>

      <div className="totals-card">
        {totals.vatGroups.map((group) => (
          <div key={group.vatRate} data-testid={`vat-group-${group.vatRate}`}>
            <div className="totals-row"><span>{group.vatRate === 0 ? 'Werk met verlegging' : `Werk aan ${group.vatRate === 0.06 ? '6%' : '21%'} btw`}</span><span>{formatEuros(group.subtotalCents)}</span></div>
            <div className="totals-row"><span>{group.vatRate === 0 ? 'Btw verlegd' : `Btw ${group.vatRate === 0.06 ? '6%' : '21%'}`}</span><span>{formatEuros(group.vatAmountCents)}</span></div>
          </div>
        ))}
        <div className="totals-grand">
          <strong>Totaal incl. btw</strong>
          <strong data-testid="grand-total">
            {formatEuros(totals.grandTotalCents)}
          </strong>
        </div>
      </div>
    </div>
  );
}
