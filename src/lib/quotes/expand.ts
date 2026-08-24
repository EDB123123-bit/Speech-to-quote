import type {
  LineClassification,
  LineType,
  QuotePriceSource,
  QuoteLineKind,
  VatRate,
} from '@/lib/supabase/types';

export type ExtractedTask = {
  /** @deprecated accepted only when reading legacy model fixtures; never used for new generation. */
  catalogItemId?: string | null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unitPriceCents?: number | null;
  priceExplicit?: boolean;
  classification?: Exclude<LineClassification, 'unclassified'>;
};

export type NewLineItem = {
  catalog_item_id: null;
  description: string;
  quantity: number | null;
  unit: string | null;
  unit_code: null;
  unit_price_cents: number | null;
  vat_rate: VatRate | null;
  line_type: LineType;
  classification: Exclude<LineClassification, 'unclassified'>;
  line_kind: QuoteLineKind;
  price_source: QuotePriceSource;
  sort_order: number;
};

function legacyLineType(classification: Exclude<LineClassification, 'unclassified'>): LineType {
  return classification === 'material' ? 'materials' : 'labor';
}

/**
 * New V1 quotes contain one truthful row per spoken work item. Catalogue rows
 * are intentionally not consulted here; historical catalogue-linked rows are
 * preserved by the database and rendered through their legacy line_type.
 */
export function expandTasksToLineItems(tasks: ExtractedTask[], _legacyCatalog?: unknown): NewLineItem[] {
  void _legacyCatalog;
  return tasks.map((task, index) => {
    const classification = task.classification ?? 'labor_service';
    const quantity = task.quantity !== null && task.quantity > 0 ? task.quantity : null;
    const unit = task.unit?.trim() || null;
    const lineKind: QuoteLineKind = quantity !== null && unit !== null ? 'detailed' : 'simple';
    const price = task.priceExplicit === true && task.unitPriceCents !== null && task.unitPriceCents !== undefined && task.unitPriceCents >= 0
      ? task.unitPriceCents
      : null;

    return {
      catalog_item_id: null,
      description: task.description.trim(),
      quantity: lineKind === 'simple' ? null : quantity,
      unit: lineKind === 'simple' ? null : unit,
      unit_code: null,
      unit_price_cents: price,
      vat_rate: null,
      line_type: legacyLineType(classification),
      classification,
      line_kind: lineKind,
      price_source: price === null ? 'unknown' : 'explicit',
      sort_order: index,
    };
  });
}
