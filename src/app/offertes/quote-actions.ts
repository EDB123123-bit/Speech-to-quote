'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';

export async function saveQuoteMetadata(quoteId: string, form: FormData): Promise<void> {
  const { supabase } = await requireContractor();
  const quoteNumber = String(form.get('quote_number') ?? '').trim();
  const issueDate = String(form.get('issue_date') ?? '').trim();
  const validUntil = String(form.get('valid_until') ?? '').trim();
  if (!quoteNumber || !/^\d{4}-\d{2}-\d{2}$/u.test(issueDate)) throw new Error('Vul een offertenummer en geldige datum in.');
  if (validUntil && (!/^\d{4}-\d{2}-\d{2}$/u.test(validUntil) || validUntil < issueDate)) throw new Error('De geldigheidsdatum moet op of na de offertedatum liggen.');
  const { error } = await supabase.from('quotes').update({
    quote_number: quoteNumber,
    issue_date: issueDate,
    valid_until: validUntil || null,
    order_reference: String(form.get('order_reference') ?? '').trim() || null,
  }).eq('id', quoteId).eq('status', 'draft');
  if (error?.code === '23505') throw new Error('Dit offertenummer bestaat al.');
  if (error) throw new Error('Offertegegevens opslaan mislukt.');
  revalidatePath(`/offertes/${quoteId}`);
  revalidatePath('/offertes');
}

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
