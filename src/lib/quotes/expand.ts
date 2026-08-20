import type { CatalogItem, LineType, VatRate } from '@/lib/supabase/types';

export type ExtractedTask = {
  catalogItemId: string | null;
  description: string;
  quantity: number;
  unit: string;
};

export type NewLineItem = {
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_code?: string | null;
  unit_price_cents: number | null;
  vat_rate: VatRate | null;
  line_type: LineType;
  sort_order: number;
};

const SUFFIX: Record<LineType, string> = {
  materials: 'materiaal',
  labor: 'arbeid',
};

export function expandTasksToLineItems(
  tasks: ExtractedTask[],
  catalog: CatalogItem[],
): NewLineItem[] {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const rows: NewLineItem[] = [];

  for (const task of tasks) {
    const match = task.catalogItemId ? byId.get(task.catalogItemId) : undefined;
    // A catalogItemId the model invented is treated as unmatched rather than
    // trusted — we never price a line we cannot trace to a real catalog row.
    const baseName = match ? match.name : task.description;
    const unit = match ? match.unit : task.unit;

    for (const lineType of ['materials', 'labor'] as const) {
      rows.push({
        catalog_item_id: match ? match.id : null,
        description: `${baseName} – ${SUFFIX[lineType]}`,
        quantity: task.quantity,
        unit,
        unit_code: match?.unit_code ?? null,
        unit_price_cents: match
          ? lineType === 'materials'
            ? match.materials_price_cents
            : match.labor_price_cents
          : null,
        vat_rate: match ? match.vat_rate : null,
        line_type: lineType,
        sort_order: rows.length,
      });
    }
  }

  return rows;
}
