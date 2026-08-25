'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';

function value(form: FormData, name: string): string | null {
  const text = String(form.get(name) ?? '').trim();
  return text || null;
}

function companyName(form: FormData): string {
  const name = String(form.get('company_name') ?? '').trim();
  if (!name || name.length > 200) throw new Error('Vul een bedrijfsnaam van maximaal 200 tekens in.');
  return name;
}

function supplierPayload(form: FormData) {
  return {
    company_name: companyName(form),
    contact_person: value(form, 'contact_person'),
    email: value(form, 'email'),
    phone: value(form, 'phone'),
    address: value(form, 'address'),
    vat_number: value(form, 'vat_number'),
    notes: value(form, 'notes'),
  };
}

export async function createSupplier(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const { error } = await supabase.from('suppliers').insert({ contractor_id: contractor.id, ...supplierPayload(form) });
  if (error) throw new Error('Leverancier aanmaken mislukt.');
  revalidatePath('/leveranciers');
}

export async function updateSupplier(supplierId: string, form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const { error } = await supabase.from('suppliers').update(supplierPayload(form)).eq('id', supplierId).eq('contractor_id', contractor.id);
  if (error) throw new Error('Leverancier opslaan mislukt.');
  revalidatePath('/leveranciers');
  revalidatePath(`/leveranciers/${supplierId}`);
  revalidatePath('/te-bestellen');
}

export async function deleteSupplier(supplierId: string): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const { error } = await supabase.from('suppliers').delete().eq('id', supplierId).eq('contractor_id', contractor.id);
  if (error) throw new Error('Leverancier verwijderen mislukt.');
  revalidatePath('/leveranciers');
  revalidatePath('/te-bestellen');
}
