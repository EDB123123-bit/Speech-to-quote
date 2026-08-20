import type { InvoiceLineItem, InvoiceVatCategory, InvoiceVatRate } from '@/lib/supabase/types';

export type InvoiceTotalsGroup = {
  vatRate: InvoiceVatRate;
  vatCategory: InvoiceVatCategory;
  subtotalCents: number;
  vatAmountCents: number;
};

export type InvoiceTotals = {
  groups: InvoiceTotalsGroup[];
  subtotalCents: number;
  vatTotalCents: number;
  totalCents: number;
};

export function invoiceLineTotalCents(quantity: number, unitPriceCents: number): number {
  return Math.round(quantity * unitPriceCents);
}
export function calculateInvoiceTotals(lines: Pick<InvoiceLineItem, 'quantity' | 'unit_price_cents' | 'vat_rate' | 'vat_category'>[]): InvoiceTotals {
  const grouped = new Map<string, InvoiceTotalsGroup>();
  for (const line of lines) {
    const key = `${line.vat_category}:${line.vat_rate}`;
    const current = grouped.get(key) ?? {
      vatRate: line.vat_rate,
      vatCategory: line.vat_category,
      subtotalCents: 0,
      vatAmountCents: 0,
    };
    current.subtotalCents += invoiceLineTotalCents(line.quantity, line.unit_price_cents);
    grouped.set(key, current);
  }
  const groups = [...grouped.values()]
    .sort((a, b) => a.vatRate - b.vatRate)
    .map((group) => ({
      ...group,
      vatAmountCents: Math.round(group.subtotalCents * group.vatRate),
    }));
  const subtotalCents = groups.reduce((sum, group) => sum + group.subtotalCents, 0);
  const vatTotalCents = groups.reduce((sum, group) => sum + group.vatAmountCents, 0);
  return { groups, subtotalCents, vatTotalCents, totalCents: subtotalCents + vatTotalCents };
}
