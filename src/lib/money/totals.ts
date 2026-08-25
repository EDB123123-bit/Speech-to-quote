import { INVOICE_VAT_RATES, type QuoteLineItem, type QuoteVatRate } from '@/lib/supabase/types';

export type TotalsLineItem = {
  quantity: number;
  unitPriceCents: number;
  vatRate: QuoteVatRate;
};

export function toTotalsInput(items: QuoteLineItem[]): TotalsLineItem[] {
  return items
    .filter((item) => (
      item.unit_price_cents !== null &&
      item.vat_rate !== null &&
      (item.line_kind === 'simple' || (item.quantity !== null && item.quantity > 0))
    ))
    .map((item) => ({
      // A simple line stores its selling price as a line total, so it has an
      // implicit quantity of one. Detailed lines always use their spoken or
      // manually entered quantity.
      quantity: item.line_kind === 'simple' ? 1 : item.quantity as number,
      unitPriceCents: item.unit_price_cents as number,
      vatRate: item.vat_rate as QuoteVatRate,
    }));
}

export type VatGroup = {
  vatRate: QuoteVatRate;
  subtotalCents: number;
  vatAmountCents: number;
};

export type QuoteTotals = {
  vatGroups: VatGroup[];
  subtotalCents: number;
  vatTotalCents: number;
  grandTotalCents: number;
};

export type PricingState = 'fully_priced' | 'partially_priced' | 'unpriced';

export type QuotePricingSummary = QuoteTotals & {
  state: PricingState;
  knownSubtotalCents: number;
  knownVatCents: number;
  knownTotalCents: number;
  unknownLineCount: number;
  pricedLineCount: number;
  totalLineCount: number;
  hasDefinitiveTotal: boolean;
};

export function lineSubtotalCents(item: TotalsLineItem): number {
  return Math.round(item.quantity * item.unitPriceCents);
}

export function calculateTotals(items: TotalsLineItem[]): QuoteTotals {
  const subtotalByRate = new Map<QuoteVatRate, number>();

  for (const item of items) {
    const current = subtotalByRate.get(item.vatRate) ?? 0;
    subtotalByRate.set(item.vatRate, current + lineSubtotalCents(item));
  }

  // VAT is rounded once per rate group, not per line — matches how the
  // amount appears on a Belgian invoice.
  const vatGroups: VatGroup[] = INVOICE_VAT_RATES.filter((rate) => subtotalByRate.has(rate)).map(
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

export function summarizePricing(items: QuoteLineItem[]): QuotePricingSummary {
  const knownItems = toTotalsInput(items);
  const totals = calculateTotals(knownItems);
  const unknownLineCount = items.filter((item) => {
    const hasQuantity = item.line_kind === 'simple' || (item.quantity !== null && item.quantity > 0);
    return item.unit_price_cents === null || item.vat_rate === null || !hasQuantity;
  }).length;
  const pricedLineCount = items.length - unknownLineCount;
  const state: PricingState = unknownLineCount === 0
    ? 'fully_priced'
    : pricedLineCount === 0
      ? 'unpriced'
      : 'partially_priced';

  return {
    ...totals,
    state,
    knownSubtotalCents: totals.subtotalCents,
    knownVatCents: totals.vatTotalCents,
    knownTotalCents: totals.grandTotalCents,
    unknownLineCount,
    pricedLineCount,
    totalLineCount: items.length,
    hasDefinitiveTotal: state === 'fully_priced',
  };
}

export function formatEuros(cents: number): string {
  const formatted = new Intl.NumberFormat('nl-BE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return `€ ${formatted}`;
}
