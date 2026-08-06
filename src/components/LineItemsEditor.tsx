'use client';

import type { QuoteLineItem, VatRate } from '@/lib/supabase/types';
import { calculateTotals, formatEuros, type TotalsLineItem } from '@/lib/money/totals';

export function toTotalsInput(items: QuoteLineItem[]): TotalsLineItem[] {
  return items
    .filter((item) => item.unit_price_cents !== null && item.vat_rate !== null)
    .map((item) => ({
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents as number,
      vatRate: item.vat_rate as VatRate,
    }));
}

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
      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const incomplete = item.unit_price_cents === null || item.vat_rate === null;
          return (
            <li key={item.id} className={`rounded border p-3 ${incomplete ? 'border-amber-400 bg-amber-50' : ''}`}>
              <input
                aria-label="Omschrijving"
                value={item.description}
                disabled={readOnly}
                onChange={(e) => patch(item.id, { description: e.target.value })}
                className="mb-2 w-full rounded border p-2"
              />

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="flex flex-col gap-1 text-xs">
                  Aantal
                  <input
                    key={item.id}
                    aria-label={`Aantal voor ${item.description}`}
                    type="number"
                    step="any"
                    defaultValue={item.quantity}
                    disabled={readOnly}
                    onChange={(e) => patch(item.id, { quantity: Number(e.target.value) })}
                    className="rounded border p-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  Eenheid
                  <input
                    aria-label={`Eenheid voor ${item.description}`}
                    value={item.unit}
                    disabled={readOnly}
                    onChange={(e) => patch(item.id, { unit: e.target.value })}
                    className="rounded border p-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
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
                    className="rounded border p-2"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs">
                  Btw
                  <select
                    aria-label={`Btw-tarief voor ${item.description}`}
                    value={item.vat_rate ?? ''}
                    disabled={readOnly}
                    onChange={(e) =>
                      patch(item.id, {
                        vat_rate: e.target.value === '' ? null : (Number(e.target.value) as VatRate),
                      })
                    }
                    className="rounded border p-2"
                  >
                    <option value="">Kies…</option>
                    <option value="0.06">6%</option>
                    <option value="0.21">21%</option>
                  </select>
                </label>
              </div>

              {incomplete && (
                <p className="mt-2 text-xs text-amber-800">
                  Vul prijs en btw-tarief aan voordat je de offerte afwerkt.
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="rounded border p-4">
        {totals.vatGroups.map((group) => (
          <div key={group.vatRate} data-testid={`vat-group-${group.vatRate}`} className="flex justify-between text-sm">
            <span>
              Subtotaal {group.vatRate === 0.06 ? '6%' : '21%'} btw
            </span>
            <span>
              {formatEuros(group.subtotalCents)} + {formatEuros(group.vatAmountCents)} btw
            </span>
          </div>
        ))}
        <div className="mt-2 flex justify-between border-t pt-2 font-bold">
          <span>Totaal incl. btw</span>
          <span data-testid="grand-total">{formatEuros(totals.grandTotalCents)}</span>
        </div>
      </div>
    </div>
  );
}
