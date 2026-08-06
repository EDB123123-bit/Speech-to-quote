import { describe, it, expect } from 'vitest';
import { checkFinalizeGate } from '@/lib/quotes/finalize-gate';
import type { QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

function line(overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'line-1', quote_id: 'q1', catalog_item_id: 'cat-1',
    description: 'Dakpannen – materiaal', quantity: 80, unit: 'm²',
    unit_price_cents: 3000, vat_rate: 0.06, line_type: 'materials',
    sort_order: 0, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

function clar(overrides: Partial<QuoteClarification> = {}): QuoteClarification {
  return {
    id: 'clar-1', quote_id: 'q1', question_nl: 'Welk type?',
    status: 'pending', retry_count: 0, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

const completeQuote = {
  status: 'draft' as const,
  customer_name: 'Jan Peeters',
  customer_address: 'Kerkstraat 1, 9000 Gent',
};

describe('checkFinalizeGate', () => {
  it('passes a complete quote', () => {
    expect(
      checkFinalizeGate({ quote: completeQuote, lineItems: [line()], clarifications: [] }),
    ).toEqual([]);
  });

  it('blocks a quote with no line items', () => {
    const blockers = checkFinalizeGate({ quote: completeQuote, lineItems: [], clarifications: [] });
    expect(blockers.map((b) => b.code)).toContain('no_line_items');
  });

  it('blocks a line item with no price', () => {
    const blockers = checkFinalizeGate({
      quote: completeQuote, lineItems: [line({ unit_price_cents: null })], clarifications: [],
    });
    expect(blockers.map((b) => b.code)).toContain('incomplete_line_item');
  });

  it('blocks a line item with no VAT rate', () => {
    const blockers = checkFinalizeGate({
      quote: completeQuote, lineItems: [line({ vat_rate: null })], clarifications: [],
    });
    expect(blockers.map((b) => b.code)).toContain('incomplete_line_item');
  });

  it('blocks a pending clarification', () => {
    const blockers = checkFinalizeGate({
      quote: completeQuote, lineItems: [line()], clarifications: [clar()],
    });
    expect(blockers.map((b) => b.code)).toContain('pending_clarification');
  });

  it('allows a resolved clarification', () => {
    expect(
      checkFinalizeGate({
        quote: completeQuote, lineItems: [line()], clarifications: [clar({ status: 'resolved' })],
      }),
    ).toEqual([]);
  });

  it('allows a dismissed clarification', () => {
    expect(
      checkFinalizeGate({
        quote: completeQuote, lineItems: [line()], clarifications: [clar({ status: 'dismissed' })],
      }),
    ).toEqual([]);
  });

  it('blocks a missing customer name', () => {
    const blockers = checkFinalizeGate({
      quote: { ...completeQuote, customer_name: null }, lineItems: [line()], clarifications: [],
    });
    expect(blockers.map((b) => b.code)).toContain('missing_customer');
  });

  it('blocks a blank customer address', () => {
    const blockers = checkFinalizeGate({
      quote: { ...completeQuote, customer_address: '   ' }, lineItems: [line()], clarifications: [],
    });
    expect(blockers.map((b) => b.code)).toContain('missing_customer');
  });

  it('blocks an already-finalized quote', () => {
    const blockers = checkFinalizeGate({
      quote: { ...completeQuote, status: 'final' }, lineItems: [line()], clarifications: [],
    });
    expect(blockers.map((b) => b.code)).toContain('already_final');
  });

  it('blocks a final quote independently even if everything else is complete', () => {
    const blockers = checkFinalizeGate({
      quote: { ...completeQuote, status: 'final' }, lineItems: [line()], clarifications: [],
    });
    expect(blockers).toEqual([{ code: 'already_final', messageNl: expect.any(String) }]);
  });

  it('reports every blocker at once, not just the first', () => {
    const blockers = checkFinalizeGate({
      quote: { status: 'draft', customer_name: null, customer_address: null },
      lineItems: [],
      clarifications: [clar()],
    });
    expect(blockers.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every blocker a Dutch message', () => {
    const blockers = checkFinalizeGate({
      quote: { status: 'draft', customer_name: null, customer_address: null },
      lineItems: [line({ vat_rate: null })],
      clarifications: [clar()],
    });
    for (const blocker of blockers) {
      expect(blocker.messageNl.length).toBeGreaterThan(0);
    }
  });
});
