import { describe, expect, it } from 'vitest';
import { reconcileExtraction } from '@/lib/quotes/reconcile';

describe('reconcileExtraction', () => {
  it('does not turn a missing price into a clarification', () => {
    const result = reconcileExtraction('dakpannen', {
      tasks: [{ description: 'Dakpannen', quantity: null, unit: null, unitPriceCents: null, priceExplicit: false, classification: 'material' }],
      clarifications: [{ questionNl: 'Welke prijs moet ik gebruiken?' }],
    });
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].unitPriceCents).toBeNull();
    expect(result.clarifications).toEqual([]);
  });

  it('preserves missing prices and dimensions', () => {
    const result = reconcileExtraction('werk', { tasks: [{ description: ' Dakgoot ', quantity: null, unit: null, unitPriceCents: null, priceExplicit: false, classification: 'material' }], clarifications: [] });
    expect(result.tasks[0]).toMatchObject({ description: 'Dakgoot', quantity: null, unit: null, unitPriceCents: null, priceExplicit: false, classification: 'material' });
  });

  it('preserves an explicit zero price', () => {
    const result = reconcileExtraction('werk', { tasks: [{ description: 'Inspectie', quantity: 1, unit: 'stuk', unitPriceCents: 0, priceExplicit: true, classification: 'labor_service' }], clarifications: [] });
    expect(result.tasks[0].unitPriceCents).toBe(0);
  });

  it('asks a generic clarification only when extraction is empty', () => {
    const result = reconcileExtraction('onduidelijk', { tasks: [], clarifications: [] });
    expect(result.clarifications).toHaveLength(1);
  });
});
