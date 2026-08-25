import { describe, expect, it } from 'vitest';
import { findHistoricalPriceSuggestion } from '@/lib/quotes/historical-suggestions';

describe('historical selling-price suggestions', () => {
  it('prefers an exact same-classification match and never averages', () => {
    const result = findHistoricalPriceSuggestion({
      description: 'Dakpannen leggen', unit: 'm²', classification: 'material',
      candidates: [
        { description: 'Dakpannen leggen', unit: 'm²', unitPriceCents: 3200, classification: 'material', createdAt: '2026-08-01' },
        { description: 'Dakpannen leggen', unit: 'm²', unitPriceCents: 9000, classification: 'labor_service', createdAt: '2026-08-02' },
      ],
    });
    expect(result).toEqual({ unitPriceCents: 3200, source: 'historical_suggestion' });
  });

  it('does not suggest for unclassified work', () => {
    expect(findHistoricalPriceSuggestion({ description: 'Combi', unit: null, classification: 'unclassified', candidates: [] })).toBeNull();
  });
});
