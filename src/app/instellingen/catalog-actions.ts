'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import { validateCatalogInput } from '@/lib/validation/catalog';

export async function createCatalogItem(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();

  const input = validateCatalogInput({
    name: String(form.get('name') ?? ''),
    unit: String(form.get('unit') ?? ''),
    materials_price: String(form.get('materials_price') ?? ''),
    labor_price: String(form.get('labor_price') ?? ''),
    vat_rate: String(form.get('vat_rate') ?? ''),
  });

  const { error } = await supabase
    .from('catalog_items')
    .insert({ ...input, contractor_id: contractor.id });

  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
  revalidatePath('/instellingen');
}

export async function deleteCatalogItem(id: string): Promise<void> {
  const { supabase } = await requireContractor();
  const { error } = await supabase.from('catalog_items').delete().eq('id', id);
  if (error) throw new Error('Verwijderen mislukt. Probeer opnieuw.');
  revalidatePath('/instellingen');
}
