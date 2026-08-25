import { normalizeUnitCode } from './constants';
import { invoiceLineTotalCents } from './totals';
import type { Quote, QuoteLineItem, InvoiceVatCategory, InvoiceVatRate } from '@/lib/supabase/types';

export type InvoiceSourceQuote = Pick<Quote, 'id' | 'contractor_id' | 'customer_id' | 'customer_name' | 'customer_address' | 'customer_email' | 'customer_phone' | 'quote_kind' | 'parent_quote_id' | 'status' | 'quote_number'>;

export type InvoiceSourceLine = {
  id: string;
  sourceQuoteId: string;
  description: string;
  quantity: number;
  unit: string;
  unitCode: string;
  unitPriceCents: number;
  vatRate: InvoiceVatRate;
  vatCategory: InvoiceVatCategory;
  lineTotalCents: number;
  sortOrder: number;
};

export type OmittedQuoteLine = {
  quoteId: string;
  quoteNumber: string | null | undefined;
  lineId: string;
  description: string;
  reason: 'unknown_price' | 'missing_vat' | 'missing_quantity' | 'missing_unit' | 'invalid_unit';
};

export function quoteFamilyId(quote: Pick<Quote, 'id' | 'parent_quote_id'>): string {
  return quote.parent_quote_id ?? quote.id;
}

export function sameInvoiceCustomer(a: InvoiceSourceQuote, b: InvoiceSourceQuote): boolean {
  if (a.customer_id || b.customer_id) return a.customer_id === b.customer_id && a.customer_id !== null;
  return [a.customer_name, a.customer_address, a.customer_email, a.customer_phone]
    .every((value, index) => normalizeSnapshot(value) === normalizeSnapshot([b.customer_name, b.customer_address, b.customer_email, b.customer_phone][index]));
}

function normalizeSnapshot(value: string | null | undefined): string {
  return (value ?? '').trim().toLocaleLowerCase('nl-BE');
}

export function invoiceableQuoteLines(
  quote: InvoiceSourceQuote,
  lines: QuoteLineItem[],
  reverseCharge = false,
): { lines: InvoiceSourceLine[]; omitted: OmittedQuoteLine[] } {
  const invoiceLines: InvoiceSourceLine[] = [];
  const omitted: OmittedQuoteLine[] = [];

  for (const line of lines) {
    const omit = (reason: OmittedQuoteLine['reason']) => omitted.push({
      quoteId: quote.id,
      quoteNumber: quote.quote_number,
      lineId: line.id,
      description: line.description,
      reason,
    });

    if (line.unit_price_cents === null) {
      omit('unknown_price');
      continue;
    }
    if (line.vat_rate === null) {
      omit('missing_vat');
      continue;
    }

    const simple = (line.line_kind ?? 'detailed') === 'simple';
    const quantity = simple ? 1 : line.quantity;
    if (quantity === null || quantity <= 0) {
      omit('missing_quantity');
      continue;
    }
    const unit = (line.unit ?? (simple ? 'stuk' : '')).trim();
    if (!unit) {
      omit('missing_unit');
      continue;
    }
    const unitCode = normalizeUnitCode(unit, line.unit_code) ?? (simple ? 'C62' : null);
    if (!unitCode) {
      omit('invalid_unit');
      continue;
    }

    const vatRate = reverseCharge ? 0 : line.vat_rate;
    const vatCategory: InvoiceVatCategory = reverseCharge ? 'AE' : 'S';
    invoiceLines.push({
      id: line.id,
      sourceQuoteId: quote.id,
      description: line.description,
      quantity,
      unit,
      unitCode,
      unitPriceCents: line.unit_price_cents,
      vatRate: vatRate as InvoiceVatRate,
      vatCategory,
      lineTotalCents: invoiceLineTotalCents(quantity, line.unit_price_cents),
      sortOrder: invoiceLines.length,
    });
  }

  return { lines: invoiceLines, omitted };
}

export function omittedLineLabel(reason: OmittedQuoteLine['reason']): string {
  return ({
    unknown_price: 'prijs onbekend',
    missing_vat: 'btw ontbreekt',
    missing_quantity: 'aantal ontbreekt',
    missing_unit: 'eenheid ontbreekt',
    invalid_unit: 'eenheid kan niet naar Peppol worden vertaald',
  } as Record<OmittedQuoteLine['reason'], string>)[reason];
}
