'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';

export async function deleteQuote(quoteId: string): Promise<void> {
  const { supabase } = await requireContractor();
  const { data: quote, error: fetchError } = await supabase
    .from('quotes')
    .select('id, audio_path, pdf_path')
    .eq('id', quoteId)
    .single();

  if (fetchError || !quote) throw new Error('Offerte niet gevonden.');

  if (quote.audio_path) {
    const { error } = await supabase.storage.from('quote-audio').remove([quote.audio_path]);
    if (error) throw new Error('Audio van de offerte kon niet verwijderd worden.');
  }

  if (quote.pdf_path) {
    const { error } = await supabase.storage.from('quote-pdfs').remove([quote.pdf_path]);
    if (error) throw new Error('Pdf van de offerte kon niet verwijderd worden.');
  }

  const { error: deleteError } = await supabase.from('quotes').delete().eq('id', quoteId);
  if (deleteError) throw new Error('Offerte verwijderen mislukt. Probeer opnieuw.');

  revalidatePath('/offertes');
}
