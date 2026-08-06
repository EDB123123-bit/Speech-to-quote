'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import { parseProfileInput } from './parse';

export async function saveProfile(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const input = parseProfileInput(form);

  const { error } = await supabase.from('contractors').update(input).eq('id', contractor.id);
  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');

  revalidatePath('/instellingen');
}
