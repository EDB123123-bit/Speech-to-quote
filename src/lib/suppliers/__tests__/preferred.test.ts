import { describe, expect, it } from 'vitest';
import { buildPreferredSupplierMap } from '../preferred';

describe('buildPreferredSupplierMap', () => {
  it('uses only successfully sent orders and the latest relationship', () => {
    const map = buildPreferredSupplierMap([
      { description: 'Cement', supplierId: 'draft-supplier', supplierName: 'Draft', orderStatus: 'draft', sentAt: null },
      { description: 'Cement', supplierId: 'old', supplierName: 'Old', orderStatus: 'sent', sentAt: '2026-01-01T00:00:00Z' },
      { description: '  cement  ', supplierId: 'new', supplierName: 'New', orderStatus: 'sent', sentAt: '2026-02-01T00:00:00Z' },
    ]);
    expect(map.get('cement')).toEqual({ supplierId: 'new', supplierName: 'New', sentAt: '2026-02-01T00:00:00Z' });
  });

  it('ignores incomplete history', () => {
    expect(buildPreferredSupplierMap([{ description: 'Cement', supplierId: 'x', supplierName: 'X', orderStatus: 'sent', sentAt: null }])).toEqual(new Map());
  });
});
