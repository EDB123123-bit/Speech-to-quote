import { describe, it, expect } from 'vitest';
import { expandTasksToLineItems } from '@/lib/quotes/expand';
import type { CatalogItem } from '@/lib/supabase/types';

const tiles: CatalogItem = {
  id: 'cat-1',
  contractor_id: 'contractor-1',
  name: 'Dakpannen leggen (kleitegels)',
  unit: 'm²',
  materials_price_cents: 3000,
  labor_price_cents: 1500,
  vat_rate: 0.06,
  created_at: '2026-08-06T00:00:00Z',
};

describe('expandTasksToLineItems', () => {
  it('expands a matched task into a materials row and a labor row', () => {
    const rows = expandTasksToLineItems(
      [{ catalogItemId: 'cat-1', description: 'Dakpannen leggen', quantity: 80, unit: 'm²' }],
      [tiles],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      catalog_item_id: 'cat-1',
      description: 'Dakpannen leggen (kleitegels) – materiaal',
      quantity: 80,
      unit: 'm²',
      unit_price_cents: 3000,
      vat_rate: 0.06,
      line_type: 'materials',
    });
    expect(rows[1]).toMatchObject({
      catalog_item_id: 'cat-1',
      description: 'Dakpannen leggen (kleitegels) – arbeid',
      unit_price_cents: 1500,
      vat_rate: 0.06,
      line_type: 'labor',
    });
  });

  it('copies prices from the catalog so later catalog edits do not change the quote', () => {
    const rows = expandTasksToLineItems(
      [{ catalogItemId: 'cat-1', description: 'x', quantity: 1, unit: 'm²' }],
      [tiles],
    );
    expect(rows[0].unit_price_cents).toBe(tiles.materials_price_cents);
    expect(rows[1].unit_price_cents).toBe(tiles.labor_price_cents);
  });

  it('expands an unmatched task into two empty rows for the contractor to price', () => {
    const rows = expandTasksToLineItems(
      [{ catalogItemId: null, description: 'Zinken dakgoot vervangen', quantity: 12, unit: 'm' }],
      [tiles],
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      catalog_item_id: null,
      description: 'Zinken dakgoot vervangen – materiaal',
      quantity: 12,
      unit: 'm',
      unit_price_cents: null,
      vat_rate: null,
      line_type: 'materials',
    });
    expect(rows[1].line_type).toBe('labor');
    expect(rows[1].unit_price_cents).toBeNull();
  });

  it('treats a catalogItemId that is not in the catalog as unmatched', () => {
    const rows = expandTasksToLineItems(
      [{ catalogItemId: 'does-not-exist', description: 'Iets', quantity: 1, unit: 'stuk' }],
      [tiles],
    );
    expect(rows[0].catalog_item_id).toBeNull();
    expect(rows[0].unit_price_cents).toBeNull();
  });

  it('assigns increasing sort_order so rows keep a stable display sequence', () => {
    const rows = expandTasksToLineItems(
      [
        { catalogItemId: 'cat-1', description: 'A', quantity: 1, unit: 'm²' },
        { catalogItemId: null, description: 'B', quantity: 2, unit: 'm' },
      ],
      [tiles],
    );
    expect(rows.map((r) => r.sort_order)).toEqual([0, 1, 2, 3]);
  });

  it('returns nothing for no tasks', () => {
    expect(expandTasksToLineItems([], [tiles])).toEqual([]);
  });
});
