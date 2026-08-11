'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import { validateStageName } from '@/lib/validation/pipeline-stage';
import { nextSortOrder, canDeleteStage, swapSortOrder } from '@/lib/quotes/stage-order';

export async function createStage(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const name = validateStageName(String(form.get('name') ?? ''));

  const { data: existing } = await supabase
    .from('pipeline_stages').select('sort_order').eq('contractor_id', contractor.id);

  const { error } = await supabase.from('pipeline_stages').insert({
    contractor_id: contractor.id,
    name,
    sort_order: nextSortOrder(existing ?? []),
  });

  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
}

export async function renameStage(id: string, form: FormData): Promise<void> {
  const { supabase } = await requireContractor();
  const name = validateStageName(String(form.get('name') ?? ''));

  const { error } = await supabase.from('pipeline_stages').update({ name }).eq('id', id);
  if (error) throw new Error('Opslaan mislukt. Probeer opnieuw.');
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
}

export async function deleteStage(id: string): Promise<void> {
  const { supabase } = await requireContractor();

  const { count } = await supabase
    .from('quotes').select('id', { count: 'exact', head: true }).eq('pipeline_stage_id', id);

  const decision = canDeleteStage(count ?? 0);
  if (!decision.allowed) throw new Error(decision.reason);

  const { error } = await supabase.from('pipeline_stages').delete().eq('id', id);
  if (error) throw new Error('Verwijderen mislukt. Probeer opnieuw.');
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
}

export async function reorderStage(id: string, direction: 'up' | 'down'): Promise<void> {
  const { supabase, contractor } = await requireContractor();

  const { data: stages } = await supabase
    .from('pipeline_stages').select('id, sort_order').eq('contractor_id', contractor.id);

  const swap = swapSortOrder(stages ?? [], id, direction);
  if (!swap) return; // already at the edge — nothing to do

  for (const item of swap) {
    const { error } = await supabase
      .from('pipeline_stages').update({ sort_order: item.sort_order }).eq('id', item.id);
    if (error) throw new Error('Herordenen mislukt. Probeer opnieuw.');
  }
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
}
