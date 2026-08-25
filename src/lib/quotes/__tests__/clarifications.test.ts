import { describe, expect, it } from 'vitest';
import { filterPriceClarifications, isPriceClarification } from '@/lib/quotes/clarifications';

describe('price clarifications', () => {
  it('identifies questions that ask for a price', () => {
    expect(isPriceClarification('Welke prijs moet ik invullen?')).toBe(true);
    expect(isPriceClarification('Welk type dakpan wil je gebruiken?')).toBe(false);
  });

  it('removes price questions while keeping scope questions', () => {
    expect(filterPriceClarifications([
      { questionNl: 'Welke prijs moet ik invullen?' },
      { questionNl: 'Welk type dakpan wil je gebruiken?' },
    ])).toEqual([{ questionNl: 'Welk type dakpan wil je gebruiken?' }]);
  });
});
