import { describe, expect, it } from 'vitest';
import { summarizePricing } from '@/lib/money/totals';
import type { QuoteLineItem } from '@/lib/supabase/types';

const base = (overrides: Partial<QuoteLineItem> = {}): QuoteLineItem => ({
  id: crypto.randomUUID(), quote_id: 'q', catalog_item_id: null, description: 'Werk', quantity: 1, unit: 'stuk',
  unit_price_cents: 1000, vat_rate: 0.21, line_type: 'labor', line_kind: 'detailed', sort_order: 0, created_at: new Date().toISOString(), ...overrides,
});

describe('summarizePricing', () => {
  it('distinguishes unknown from an explicit zero', () => {
    expect(summarizePricing([base({ unit_price_cents: null })]).state).toBe('unpriced');
    expect(summarizePricing([base({ unit_price_cents: 0 })]).state).toBe('fully_priced');
    expect(summarizePricing([base({ unit_price_cents: 0 })]).knownTotalCents).toBe(0);
  });

  it('reports partial totals as non-definitive', () => {
    const result = summarizePricing([base(), base({ id: 'unknown', unit_price_cents: null })]);
    expect(result.state).toBe('partially_priced');
    expect(result.hasDefinitiveTotal).toBe(false);
    expect(result.knownTotalCents).toBe(1210);
  });
});
