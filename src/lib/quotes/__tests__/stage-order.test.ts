import { describe, it, expect } from 'vitest';
import { nextSortOrder, canDeleteStage, swapSortOrder } from '@/lib/quotes/stage-order';

describe('nextSortOrder', () => {
  it('returns 0 for an empty list', () => {
    expect(nextSortOrder([])).toBe(0);
  });

  it('returns one past the current maximum', () => {
    expect(nextSortOrder([{ sort_order: 0 }, { sort_order: 3 }])).toBe(4);
  });
});

describe('canDeleteStage', () => {
  it('allows deleting an empty stage', () => {
    expect(canDeleteStage(0)).toEqual({ allowed: true });
  });

  it('blocks deleting an occupied stage with a count in the message', () => {
    const result = canDeleteStage(3);
    expect(result.allowed).toBe(false);
    if (!result.allowed) expect(result.reason).toBe('Verplaats eerst de 3 offerte(s) uit deze fase voordat je ze verwijdert.');
  });
});

describe('swapSortOrder', () => {
  const stages = [
    { id: 'a', sort_order: 0 },
    { id: 'b', sort_order: 1 },
    { id: 'c', sort_order: 2 },
  ];

  it('swaps with the next stage when moving down', () => {
    expect(swapSortOrder(stages, 'a', 'down')).toEqual([
      { id: 'a', sort_order: 1 },
      { id: 'b', sort_order: 0 },
    ]);
  });

  it('swaps with the previous stage when moving up', () => {
    expect(swapSortOrder(stages, 'c', 'up')).toEqual([
      { id: 'c', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ]);
  });

  it('returns null when there is no neighbor in that direction', () => {
    expect(swapSortOrder(stages, 'a', 'up')).toBeNull();
    expect(swapSortOrder(stages, 'c', 'down')).toBeNull();
  });
});
