'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import { disconnectMailboxConnection } from '@/lib/mailbox/connection';
import { parseProfileInput } from './parse';
import { assertBelgianSellerIdentifiers } from '@/lib/invoices/validation';

export async function saveProfile(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const input = parseProfileInput(form);

  if ('registration_number' in input && (input.registration_number || input.vat_number || input.iban)) {
    assertBelgianSellerIdentifiers({
      enterpriseNumber: input.registration_number,
      vatNumber: input.vat_number,
      iban: input.iban,
    });
  }

  if ('invoice_prefix' in input && input.invoice_prefix !== (contractor.invoice_prefix ?? 'STQ')) {
    const { data: issued } = await supabase.from('invoices').select('id').neq('status', 'draft').limit(1);
    if (issued && issued.length > 0) throw new Error('De factuurnummer-prefix kan niet meer wijzigen nadat een factuur is uitgegeven.');
  }

  const { error } = await supabase.from('contractors').update(input).eq('id', contractor.id);
  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');

  revalidatePath('/instellingen');
}

export async function disconnectMailbox(form: FormData): Promise<void> {
  const { contractor } = await requireContractor();
  const provider = String(form.get('provider') ?? '').trim();
  await disconnectMailboxConnection(contractor.id, provider === 'gmail' || provider === 'outlook' ? provider : undefined);
  revalidatePath('/instellingen');
}
