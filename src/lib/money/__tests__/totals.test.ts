import { describe, it, expect } from 'vitest';
import { lineSubtotalCents, calculateTotals, formatEuros } from '@/lib/money/totals';

describe('lineSubtotalCents', () => {
  it('multiplies quantity by unit price', () => {
    expect(lineSubtotalCents({ quantity: 80, unitPriceCents: 4500, vatRate: 0.06 })).toBe(360000);
  });

  it('handles fractional quantities', () => {
    expect(lineSubtotalCents({ quantity: 80.5, unitPriceCents: 4500, vatRate: 0.06 })).toBe(362250);
  });

  it('rounds a fractional cent result to the nearest cent', () => {
    // 0.5 * 333 = 166.5 -> 167
    expect(lineSubtotalCents({ quantity: 0.5, unitPriceCents: 333, vatRate: 0.06 })).toBe(167);
  });
});

describe('calculateTotals', () => {
  it('returns all-zero totals for an empty quote', () => {
    expect(calculateTotals([])).toEqual({
      vatGroups: [],
      subtotalCents: 0,
      vatTotalCents: 0,
      grandTotalCents: 0,
    });
  });

  it('computes a single-rate quote', () => {
    const totals = calculateTotals([
      { quantity: 80, unitPriceCents: 4500, vatRate: 0.06 }, // 360000
      { quantity: 10, unitPriceCents: 2000, vatRate: 0.06 }, //  20000
    ]);
    expect(totals.subtotalCents).toBe(380000);
    expect(totals.vatGroups).toEqual([
      { vatRate: 0.06, subtotalCents: 380000, vatAmountCents: 22800 },
    ]);
    expect(totals.vatTotalCents).toBe(22800);
    expect(totals.grandTotalCents).toBe(402800);
  });

  it('groups mixed VAT rates separately and sorts them ascending', () => {
    const totals = calculateTotals([
      { quantity: 1, unitPriceCents: 100000, vatRate: 0.21 },
      { quantity: 1, unitPriceCents: 200000, vatRate: 0.06 },
    ]);
    expect(totals.vatGroups).toEqual([
      { vatRate: 0.06, subtotalCents: 200000, vatAmountCents: 12000 },
      { vatRate: 0.21, subtotalCents: 100000, vatAmountCents: 21000 },
    ]);
    expect(totals.subtotalCents).toBe(300000);
    expect(totals.vatTotalCents).toBe(33000);
    expect(totals.grandTotalCents).toBe(333000);
  });

  it('rounds VAT once per group, not per line', () => {
    // Two lines of 1667 cents at 6%. Per-line rounding would give 100+100=200.
    // Correct: group subtotal 3334 * 0.06 = 200.04 -> 200. Same here, so use a
    // case where they differ: 3 lines of 1667 -> 5001 * 0.06 = 300.06 -> 300,
    // whereas per-line would be 3 * 100 = 300. Use 833 cents instead:
    // per-line 833*0.06 = 49.98 -> 50, x3 = 150.
    // grouped: 2499 * 0.06 = 149.94 -> 150. Use 850: per-line 51 x3 = 153;
    // grouped 2550 * 0.06 = 153. Pick a true divergence: 1650 at 21%.
    // per-line: 346.5 -> 347, x2 = 694. grouped: 3300 * 0.21 = 693.
    const totals = calculateTotals([
      { quantity: 1, unitPriceCents: 1650, vatRate: 0.21 },
      { quantity: 1, unitPriceCents: 1650, vatRate: 0.21 },
    ]);
    expect(totals.vatGroups[0].vatAmountCents).toBe(693);
  });

  it('ignores nothing — every line contributes to its group', () => {
    const totals = calculateTotals([
      { quantity: 2, unitPriceCents: 1000, vatRate: 0.06 },
      { quantity: 3, unitPriceCents: 1000, vatRate: 0.06 },
      { quantity: 1, unitPriceCents: 5000, vatRate: 0.21 },
    ]);
    expect(totals.vatGroups).toHaveLength(2);
    expect(totals.subtotalCents).toBe(10000);
  });
});

describe('formatEuros', () => {
  it('formats with Belgian Dutch separators', () => {
    expect(formatEuros(123456)).toBe('€ 1.234,56');
  });

  it('always shows two decimals', () => {
    expect(formatEuros(500)).toBe('€ 5,00');
  });

  it('formats zero', () => {
    expect(formatEuros(0)).toBe('€ 0,00');
  });
});
