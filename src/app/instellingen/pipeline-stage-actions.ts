'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import { validateStageName } from '@/lib/validation/pipeline-stage';
import { nextSortOrder, canDeleteStage, swapSortOrder, revertSwap } from '@/lib/quotes/stage-order';

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

  const applied: typeof swap[number][] = [];
  for (const item of swap) {
    const { error } = await supabase
      .from('pipeline_stages').update({ sort_order: item.sort_order }).eq('id', item.id);
    if (error) {
      // The swap is one logical operation split into two calls — if the second
      // fails after the first succeeded, best-effort revert the row(s) already
      // written so we don't leave two stages with inconsistent sort_order until
      // the next successful reorder. Revert failure is swallowed: we still
      // throw the same generic error either way rather than masking it.
      for (const done of revertSwap(stages ?? [], applied)) {
        await supabase.from('pipeline_stages').update({ sort_order: done.sort_order }).eq('id', done.id);
      }
      throw new Error('Herordenen mislukt. Probeer opnieuw.');
    }
    applied.push(item);
  }
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
}
