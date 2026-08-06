'use server';

import { requireContractor } from '@/lib/auth/require-contractor';

export async function dismissClarification(id: string): Promise<void> {
  const { supabase } = await requireContractor();
  const { error } = await supabase
    .from('quote_clarifications')
    .update({ status: 'dismissed' })
    .eq('id', id);
  if (error) throw new Error('Bijwerken mislukt. Probeer opnieuw.');
}
