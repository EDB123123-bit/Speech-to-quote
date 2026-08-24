'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import { normalizeCustomerName } from '@/lib/customers/derive';

function optional(form: FormData, key: string): string | null {
  const value = (form.get(key) as string | null)?.trim();
  return value ? value : null;
}

export async function saveCustomerDetails(quoteId: string, form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const { data: draftQuote } = await supabase
    .from('quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('contractor_id', contractor.id)
    .eq('status', 'draft')
    .maybeSingle();
  if (!draftQuote) throw new Error('Alleen conceptoffertes kunnen klantgegevens wijzigen.');

  const name = optional(form, 'customer_name');
  const address = optional(form, 'customer_address');
  const email = optional(form, 'customer_email');
  const phone = optional(form, 'customer_phone');

  let customerId: string | null = null;
  if (name) {
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .upsert({
        contractor_id: contractor.id,
        name,
        normalized_name: normalizeCustomerName(name),
        address,
        email,
        phone,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'contractor_id,normalized_name' })
      .select('id')
      .single();
    if (customerError || !customer) throw new Error('Klant opslaan mislukt. Probeer opnieuw.');
    customerId = customer.id as string;
  }

  const { error } = await supabase
    .from('quotes')
    .update({
      customer_id: customerId,
      customer_name: name,
      customer_address: address,
      customer_email: email,
      customer_phone: phone,
    })
    .eq('id', quoteId)
    .eq('status', 'draft');

  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
  revalidatePath(`/offertes/${quoteId}`);
}
