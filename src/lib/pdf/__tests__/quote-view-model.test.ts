import { describe, it, expect } from 'vitest';
import { buildQuoteViewModel } from '@/lib/pdf/quote-view-model';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

const contractor: Contractor = {
  id: 'c1', company_name: 'Dakwerken Janssens', address: 'Kerkstraat 1, 9000 Gent',
  vat_number: 'BE0123456789', phone: '0470123456', onboarding_completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
};

const quote: Quote = {
  id: 'a1b2c3d4-0000-0000-0000-000000000000', contractor_id: 'c1',
  transcript: 'tachtig vierkante meter', status: 'final',
  customer_name: 'Jan Peeters', customer_address: 'Dorpsstraat 5, 9050 Gentbrugge',
  customer_email: null, customer_phone: null, audio_path: null, audio_deleted_at: null,
  pdf_path: null, created_at: '2026-08-06T10:30:00Z',
};

function line(overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'line-1', quote_id: quote.id, catalog_item_id: 'cat-1',
    description: 'Dakpannen leggen – materiaal', quantity: 80, unit: 'm²',
    unit_price_cents: 3000, vat_rate: 0.06, line_type: 'materials',
    sort_order: 0, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

describe('buildQuoteViewModel', () => {
  it('carries the contractor letterhead details', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.contractor.companyName).toBe('Dakwerken Janssens');
    expect(model.contractor.vatNumber).toBe('BE0123456789');
  });

  it('carries the customer details', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.customer.name).toBe('Jan Peeters');
    expect(model.customer.address).toBe('Dorpsstraat 5, 9050 Gentbrugge');
  });

  it('derives a short human-readable quote number from the id', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.quoteNumber).toBe('A1B2C3D4');
  });

  it('formats the date in Belgian Dutch convention', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.dateNl).toBe('06/08/2026');
  });

  it('groups the materials and labor rows of one task together', () => {
    const model = buildQuoteViewModel({
      contractor, quote,
      lineItems: [
        line({ id: 'l1', description: 'Dakpannen leggen – materiaal', line_type: 'materials' }),
        line({ id: 'l2', description: 'Dakpannen leggen – arbeid', line_type: 'labor', unit_price_cents: 1500 }),
      ],
    });
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].title).toBe('Dakpannen leggen');
    expect(model.groups[0].rows).toHaveLength(2);
  });

  it('keeps unrelated tasks in separate groups', () => {
    const model = buildQuoteViewModel({
      contractor, quote,
      lineItems: [
        line({ id: 'l1', description: 'Dakpannen leggen – materiaal' }),
        line({ id: 'l2', description: 'Dakgoot vervangen – materiaal' }),
      ],
    });
    expect(model.groups).toHaveLength(2);
  });

  it('computes totals per VAT rate', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.totals.vatGroups).toEqual([
      { vatRate: 0.06, subtotalCents: 240000, vatAmountCents: 14400 },
    ]);
    expect(model.totals.grandTotalCents).toBe(254400);
  });

  it('shows the reduced-rate notice when any line uses 6%', () => {
    const model = buildQuoteViewModel({ contractor, quote, lineItems: [line()] });
    expect(model.showsReducedVatNotice).toBe(true);
  });

  it('omits the reduced-rate notice on a 21%-only quote', () => {
    const model = buildQuoteViewModel({
      contractor, quote, lineItems: [line({ vat_rate: 0.21 })],
    });
    expect(model.showsReducedVatNotice).toBe(false);
  });

  it('handles missing optional contractor fields', () => {
    const model = buildQuoteViewModel({
      contractor: { ...contractor, address: null, vat_number: null, phone: null },
      quote, lineItems: [line()],
    });
    expect(model.contractor.address).toBe('');
    expect(model.contractor.vatNumber).toBe('');
  });
});
