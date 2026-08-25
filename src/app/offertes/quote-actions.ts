'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import { createAdminSupabase } from '@/lib/supabase/admin';

export async function createManualQuote(): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const { data, error } = await supabase
    .from('quotes')
    .insert({ contractor_id: contractor.id, status: 'draft', source: 'manual' })
    .select('id')
    .single();
  if (error || !data) throw new Error('Handmatige offerte aanmaken mislukt.');
  const { redirect } = await import('next/navigation');
  redirect(`/offertes/${data.id}`);
}

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

/** Create a blank draft change order for an already accepted standard quote. */
export async function createMeerwerkQuote(parentQuoteId: string): Promise<void> {
  const { contractor } = await requireContractor();
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc('create_meerwerk_quote', {
    p_parent_quote_id: parentQuoteId,
    p_contractor_id: contractor.id,
  });
  if (error || !data) {
    if (error?.message.includes('meerwerk_parent_invalid')) {
      throw new Error('Een meerwerkofferte kan alleen vanuit een aanvaarde standaardofferte worden gemaakt.');
    }
    throw new Error('Meerwerkofferte aanmaken mislukt.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.quote_id) throw new Error('Meerwerkofferte aanmaken mislukt.');
  revalidatePath(`/offertes/${parentQuoteId}`);
  revalidatePath('/offertes');
  const { redirect } = await import('next/navigation');
  redirect(`/offertes/${row.quote_id}`);
}

export async function deleteQuote(quoteId: string): Promise<void> {
  const { supabase } = await requireContractor();
  const { data: quote, error: fetchError } = await supabase
    .from('quotes')
    .select('id, status, audio_path, pdf_path')
    .eq('id', quoteId)
    .single();

  if (fetchError || !quote) throw new Error('Offerte niet gevonden.');
  if (quote.status !== 'draft') throw new Error('Alleen conceptoffertes kunnen verwijderd worden.');

  if (quote.audio_path) {
    const { error } = await supabase.storage.from('quote-audio').remove([quote.audio_path]);
    if (error) throw new Error('Audio van de offerte kon niet verwijderd worden.');
  }

  if (quote.pdf_path) {
    const { error } = await createAdminSupabase().storage.from('quote-pdfs').remove([quote.pdf_path]);
    if (error) throw new Error('Pdf van de offerte kon niet verwijderd worden.');
  }

  const { error: deleteError } = await supabase.from('quotes').delete().eq('id', quoteId);
  if (deleteError) throw new Error('Offerte verwijderen mislukt. Probeer opnieuw.');

  revalidatePath('/offertes');
}
