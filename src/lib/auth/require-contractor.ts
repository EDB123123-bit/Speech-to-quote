import { createServerSupabase } from '@/lib/supabase/server';
import type { Contractor } from '@/lib/supabase/types';

export class UnauthorizedError extends Error {
  constructor() {
    super('Niet aangemeld');
    this.name = 'UnauthorizedError';
  }
}

export async function requireContractor() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();

  if (!data.user) throw new UnauthorizedError();

  const { data: contractor } = await supabase
    .from('contractors')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (!contractor) throw new UnauthorizedError();

  return { supabase, contractor: contractor as Contractor };
}
