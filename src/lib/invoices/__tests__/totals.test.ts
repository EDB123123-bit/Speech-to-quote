import { describe, expect, it } from 'vitest';
import { calculateInvoiceTotals } from '@/lib/invoices/totals';

const line = (rate: 0 | 0.06 | 0.21, category: 'S' | 'AE', price: number, quantity = 1) => ({
  quantity, unit_price_cents: price, vat_rate: rate, vat_category: category,
});
describe('calculateInvoiceTotals', () => {
  it('rounds VAT once per rate group', () => {
    const result = calculateInvoiceTotals([line(0.06, 'S', 101, 1), line(0.06, 'S', 101, 1)]);
    expect(result.subtotalCents).toBe(202);
    expect(result.vatTotalCents).toBe(12);
    expect(result.totalCents).toBe(214);
  });

  it('keeps mixed rates separate', () => {
    const result = calculateInvoiceTotals([line(0.06, 'S', 10000), line(0.21, 'S', 10000)]);
    expect(result.groups.map((group) => [group.vatRate, group.subtotalCents, group.vatAmountCents])).toEqual([
      [0.06, 10000, 600], [0.21, 10000, 2100],
    ]);
    expect(result.totalCents).toBe(22700);
  });

  it('does not add VAT for domestic reverse charge', () => {
    const result = calculateInvoiceTotals([line(0, 'AE', 12500, 2)]);
    expect(result.vatTotalCents).toBe(0);
    expect(result.totalCents).toBe(25000);
  });
});
