import { describe, expect, it } from 'vitest';
import { expandTasksToLineItems } from '@/lib/quotes/expand';

describe('expandTasksToLineItems', () => {
  it('creates one catalogue-independent truthful line per task', () => {
    const rows = expandTasksToLineItems([{ description: 'Dakpannen leggen', quantity: 80, unit: 'm²', unitPriceCents: null, priceExplicit: false, classification: 'material' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ catalog_item_id: null, classification: 'material', line_type: 'materials', quantity: 80, unit: 'm²', unit_price_cents: null, price_source: 'unknown', line_kind: 'detailed' });
  });

  it('keeps an explicit zero price and simple lines truthful', () => {
    const rows = expandTasksToLineItems([{ description: 'Inspectie', quantity: null, unit: null, unitPriceCents: 0, priceExplicit: true, classification: 'labor_service' }]);
    expect(rows[0]).toMatchObject({ unit_price_cents: 0, line_type: 'labor', line_kind: 'simple', price_source: 'explicit', quantity: null, unit: null });
  });

  it('never consults a legacy catalogue argument', () => {
    const rows = expandTasksToLineItems([{ description: 'Werk', quantity: 1, unit: 'stuk', classification: 'labor_service', unitPriceCents: null, priceExplicit: false }], [{ id: 'legacy', materials_price_cents: 999999 }]);
    expect(rows[0].unit_price_cents).toBeNull();
    expect(rows[0].catalog_item_id).toBeNull();
  });
});
