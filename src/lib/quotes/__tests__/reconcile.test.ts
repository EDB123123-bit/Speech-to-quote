import { describe, expect, it } from 'vitest';
import { reconcileExtraction } from '@/lib/quotes/reconcile';
import type { CatalogItem } from '@/lib/supabase/types';

const catalog: CatalogItem[] = [
  {
    id: 'roof-tiles', contractor_id: 'c1', name: 'Dakpannen leggen', unit: 'm²',
    materials_price_cents: 3000, labor_price_cents: 1500, vat_rate: 0.06,
    created_at: '2026-08-06T00:00:00Z',
  },
  {
    id: 'windows', contractor_id: 'c1', name: 'Ramen', unit: 'stuk',
    materials_price_cents: 100000, labor_price_cents: 50000, vat_rate: 0.21,
    created_at: '2026-08-06T00:00:00Z',
  },
];

const empty = { tasks: [], clarifications: [] };

describe('reconcileExtraction', () => {
  it('adds a priced catalog item mentioned in the transcript when the model omitted it', () => {
    const result = reconcileExtraction('20 vierkante meter en 2 ramen', empty, catalog);

    expect(result.tasks).toContainEqual({
      catalogItemId: 'windows', description: 'Ramen', quantity: 2, unit: 'stuk',
    });
    expect(result.clarifications).toEqual([]);
  });

  it('recovers a catalog item when speech recognition makes a small spelling error', () => {
    const result = reconcileExtraction('20 vierkante meter dekpannen', empty, catalog);

    expect(result.tasks).toContainEqual({
      catalogItemId: 'roof-tiles', description: 'Dakpannen leggen', quantity: 20, unit: 'm²',
    });
    expect(result.clarifications).toEqual([]);
  });

  it('adds a clarification when a catalog item is mentioned without a quantity', () => {
    const result = reconcileExtraction('We moeten ramen plaatsen', empty, catalog);

    expect(result.tasks).toEqual([]);
    expect(result.clarifications).toContainEqual({
      questionNl: 'Hoeveel Ramen moet ik opnemen?',
    });
  });

  it('enriches an extracted task with a catalog match when the model left the id empty', () => {
    const result = reconcileExtraction(
      '2 ramen',
      { tasks: [{ catalogItemId: null, description: 'Ramen', quantity: 2, unit: 'stuk' }], clarifications: [] },
      catalog,
    );

    expect(result.tasks[0].catalogItemId).toBe('windows');
  });

  it('does not claim success when the transcript produced no task or question', () => {
    const result = reconcileExtraction('iets onduidelijks', empty, catalog);

    expect(result.clarifications).toEqual([
      { questionNl: 'Welke werken of materialen moet ik op deze offerte zetten?' },
    ]);
  });
});
