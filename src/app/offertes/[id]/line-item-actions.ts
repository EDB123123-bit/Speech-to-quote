'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import type { LineClassification, LineType, QuoteLineItem, QuotePriceSource, QuoteLineKind } from '@/lib/supabase/types';
import { findHistoricalPriceSuggestion } from '@/lib/quotes/historical-suggestions';
import { loadHistoricalPriceCandidates } from '@/lib/quotes/historical-suggestions-server';

type LineItemPatch = Partial<
  Pick<QuoteLineItem, 'description' | 'source_notes' | 'quantity' | 'unit' | 'unit_price_cents' | 'vat_rate' | 'vat_category' | 'classification' | 'line_kind'>
>;

export async function updateLineItem(id: string, patch: LineItemPatch): Promise<void> {
  const { supabase } = await requireContractor();
  const nextPatch = { ...patch } as Record<string, unknown>;
  if ('unit_price_cents' in patch) {
    nextPatch.price_source = patch.unit_price_cents === null ? 'unknown' satisfies QuotePriceSource : 'manual' satisfies QuotePriceSource;
  }
  const { error } = await supabase.from('quote_line_items').update(nextPatch).eq('id', id);
  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
}

export async function addLineItem(quoteId: string, lineType: LineType | LineClassification): Promise<QuoteLineItem> {
  const { supabase, contractor } = await requireContractor();
  const classification: LineClassification = lineType === 'materials' || lineType === 'material'
    ? 'material'
    : lineType === 'combined' ? 'unclassified' : 'labor_service';
  const legacyType: LineType = classification === 'material' ? 'materials' : classification === 'labor_service' ? 'labor' : 'combined';
  const { data, error } = await supabase
    .from('quote_line_items')
    .insert({
      quote_id: quoteId,
      description: classification === 'material' ? 'Nieuw materiaal' : classification === 'labor_service' ? 'Nieuwe dienst' : 'Nieuwe lijn – nakijken',
      quantity: null,
      unit: null,
      unit_code: null,
      unit_price_cents: null,
      vat_rate: null,
      line_type: legacyType,
      classification,
      line_kind: 'simple' satisfies QuoteLineKind,
      price_source: 'unknown' satisfies QuotePriceSource,
      sort_order: 999,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error('Toevoegen mislukt. Probeer opnieuw.');
  const inserted = data as QuoteLineItem;
  const suggestion = findHistoricalPriceSuggestion({
    description: inserted.description,
    unit: inserted.unit,
    classification: inserted.classification ?? classification,
    candidates: await loadHistoricalPriceCandidates(supabase, contractor.id, quoteId),
  });
  if (suggestion) {
    const { data: suggestedRow } = await supabase.from('quote_line_items').update({ unit_price_cents: suggestion.unitPriceCents, price_source: suggestion.source }).eq('id', inserted.id).select('*').single();
    if (suggestedRow) return (revalidatePath(`/offertes/${quoteId}`), suggestedRow as QuoteLineItem);
  }
  revalidatePath(`/offertes/${quoteId}`);
  return inserted;
}

export async function removeLineItem(id: string): Promise<void> {
  const { supabase } = await requireContractor();
  const { error } = await supabase.from('quote_line_items').delete().eq('id', id);
  if (error) throw new Error('Verwijderen mislukt. Probeer opnieuw.');
}
