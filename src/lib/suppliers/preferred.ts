export type SupplierHistoryRow = {
  description: string;
  supplierId: string;
  supplierName: string;
  orderStatus: 'draft' | 'sent';
  sentAt: string | null;
};

export type PreferredSupplier = { supplierId: string; supplierName: string; sentAt: string };

export function buildPreferredSupplierMap(rows: SupplierHistoryRow[]): Map<string, PreferredSupplier> {
  const preferred = new Map<string, PreferredSupplier>();
  for (const row of rows) {
    if (row.orderStatus !== 'sent' || !row.sentAt || !row.supplierId) continue;
    const key = normalizeDescription(row.description);
    if (!key) continue;
    const current = preferred.get(key);
    if (!current || row.sentAt > current.sentAt) {
      preferred.set(key, { supplierId: row.supplierId, supplierName: row.supplierName, sentAt: row.sentAt });
    }
  }
  return preferred;
}

export function normalizeDescription(value: string): string {
  return value.trim().toLocaleLowerCase('nl-BE').replace(/\s+/g, ' ');
}
