'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import type { LineType, QuoteLineItem } from '@/lib/supabase/types';

type LineItemPatch = Partial<
  Pick<QuoteLineItem, 'description' | 'quantity' | 'unit' | 'unit_price_cents' | 'vat_rate'>
>;

export async function updateLineItem(id: string, patch: LineItemPatch): Promise<void> {
  const { supabase } = await requireContractor();
  const { error } = await supabase.from('quote_line_items').update(patch).eq('id', id);
  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
}

export async function addLineItem(quoteId: string, lineType: LineType): Promise<QuoteLineItem> {
  const { supabase } = await requireContractor();
  const { data, error } = await supabase
    .from('quote_line_items')
    .insert({
      quote_id: quoteId,
      description: lineType === 'materials' ? 'Nieuw item – materiaal' : 'Nieuw item – arbeid',
      quantity: 1,
      unit: 'stuk',
      unit_price_cents: null,
      vat_rate: null,
      line_type: lineType,
      sort_order: 999,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error('Toevoegen mislukt. Probeer opnieuw.');
  revalidatePath(`/offertes/${quoteId}`);
  return data as QuoteLineItem;
}

export async function removeLineItem(id: string): Promise<void> {
  const { supabase } = await requireContractor();
  const { error } = await supabase.from('quote_line_items').delete().eq('id', id);
  if (error) throw new Error('Verwijderen mislukt. Probeer opnieuw.');
}
