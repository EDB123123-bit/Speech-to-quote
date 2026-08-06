import { VAT_RATES, type QuoteLineItem, type VatRate } from '@/lib/supabase/types';

export type TotalsLineItem = {
  quantity: number;
  unitPriceCents: number;
  vatRate: VatRate;
};

export function toTotalsInput(items: QuoteLineItem[]): TotalsLineItem[] {
  return items
    .filter((item) => item.unit_price_cents !== null && item.vat_rate !== null)
    .map((item) => ({
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents as number,
      vatRate: item.vat_rate as VatRate,
    }));
}

export type VatGroup = {
  vatRate: VatRate;
  subtotalCents: number;
  vatAmountCents: number;
};

export type QuoteTotals = {
  vatGroups: VatGroup[];
  subtotalCents: number;
  vatTotalCents: number;
  grandTotalCents: number;
};

export function lineSubtotalCents(item: TotalsLineItem): number {
  return Math.round(item.quantity * item.unitPriceCents);
}

export function calculateTotals(items: TotalsLineItem[]): QuoteTotals {
  const subtotalByRate = new Map<VatRate, number>();

  for (const item of items) {
    const current = subtotalByRate.get(item.vatRate) ?? 0;
    subtotalByRate.set(item.vatRate, current + lineSubtotalCents(item));
  }

  // VAT is rounded once per rate group, not per line — matches how the
  // amount appears on a Belgian invoice.
  const vatGroups: VatGroup[] = VAT_RATES.filter((rate) => subtotalByRate.has(rate)).map(
    (rate) => {
      const subtotalCents = subtotalByRate.get(rate) ?? 0;
      return {
        vatRate: rate,
        subtotalCents,
        vatAmountCents: Math.round(subtotalCents * rate),
      };
    },
  );

  const subtotalCents = vatGroups.reduce((sum, g) => sum + g.subtotalCents, 0);
  const vatTotalCents = vatGroups.reduce((sum, g) => sum + g.vatAmountCents, 0);

  return {
    vatGroups,
    subtotalCents,
    vatTotalCents,
    grandTotalCents: subtotalCents + vatTotalCents,
  };
}

export function formatEuros(cents: number): string {
  const formatted = new Intl.NumberFormat('nl-BE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `€ ${formatted}`;
}
