'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';

function optional(form: FormData, key: string): string | null {
  const value = (form.get(key) as string | null)?.trim();
  return value ? value : null;
}

export async function saveCustomerDetails(quoteId: string, form: FormData): Promise<void> {
  const { supabase } = await requireContractor();

  const { error } = await supabase
    .from('quotes')
    .update({
      customer_name: optional(form, 'customer_name'),
      customer_address: optional(form, 'customer_address'),
      customer_email: optional(form, 'customer_email'),
      customer_phone: optional(form, 'customer_phone'),
    })
    .eq('id', quoteId)
    .eq('status', 'draft');

  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
  revalidatePath(`/offertes/${quoteId}`);
}
