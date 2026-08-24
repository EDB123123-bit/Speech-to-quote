import { describe, expect, it } from 'vitest';
import { invoiceableQuoteLines, quoteFamilyId, sameInvoiceCustomer } from '@/lib/invoices/quote-sources';
import type { Quote, QuoteLineItem } from '@/lib/supabase/types';

const quote = (overrides: Partial<Quote> = {}): Quote => ({
  id: 'q1', contractor_id: 'c1', customer_id: 'customer-1', transcript: null, status: 'accepted',
  quote_kind: 'standard', parent_quote_id: null, customer_name: 'Jan Peeters', customer_address: 'Kerkstraat 1',
  customer_email: 'jan@example.be', customer_phone: null, audio_path: null, audio_deleted_at: null,
  pdf_path: null, pipeline_stage_id: null, created_at: '2026-08-01T00:00:00Z', ...overrides,
});

const line = (overrides: Partial<QuoteLineItem> = {}): QuoteLineItem => ({
  id: 'l1', quote_id: 'q1', catalog_item_id: null, description: 'Dakpannen', quantity: 10, unit: 'stuk',
  unit_price_cents: 1000, vat_rate: 0.21, line_type: 'materials', sort_order: 0, created_at: '2026-08-01T00:00:00Z',
  classification: 'material', line_kind: 'detailed', price_source: 'manual', ...overrides,
});

describe('invoice quote sources', () => {
  it('uses the original quote as the family root', () => {
    expect(quoteFamilyId(quote())).toBe('q1');
    expect(quoteFamilyId(quote({ id: 'm1', quote_kind: 'meerwerk', parent_quote_id: 'q1' }))).toBe('q1');
  });

  it('requires the same stable customer', () => {
    expect(sameInvoiceCustomer(quote(), quote({ id: 'm1', quote_kind: 'meerwerk', parent_quote_id: 'q1' }))).toBe(true);
    expect(sameInvoiceCustomer(quote(), quote({ id: 'q2', customer_id: 'customer-2' }))).toBe(false);
  });

  it('omits null prices but keeps explicit zero prices', () => {
    const result = invoiceableQuoteLines(quote(), [
      line({ id: 'priced' }),
      line({ id: 'unknown', unit_price_cents: null }),
      line({ id: 'zero', unit_price_cents: 0 }),
    ]);
    expect(result.lines.map((item) => item.id)).toEqual(['priced', 'zero']);
    expect(result.omitted).toMatchObject([{ lineId: 'unknown', reason: 'unknown_price' }]);
  });

  it('does not default missing VAT or detailed dimensions', () => {
    const result = invoiceableQuoteLines(quote(), [
      line({ id: 'vat', vat_rate: null }),
      line({ id: 'quantity', quantity: null }),
      line({ id: 'unit', unit: null }),
    ]);
    expect(result.lines).toHaveLength(0);
    expect(result.omitted.map((item) => item.reason)).toEqual(['missing_vat', 'missing_quantity', 'missing_unit']);
  });
});
