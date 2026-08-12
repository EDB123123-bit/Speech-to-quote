'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import { validateStageName } from '@/lib/validation/pipeline-stage';
import { nextSortOrder, canDeleteStage, swapSortOrder, revertSwap } from '@/lib/quotes/stage-order';

export type StageActionResult = { ok: true } | { ok: false; error: string };

export async function createStage(form: FormData): Promise<StageActionResult> {
  const { supabase, contractor } = await requireContractor();
  const name = validateStageName(String(form.get('name') ?? ''));

  const { data: existing } = await supabase
    .from('pipeline_stages').select('sort_order').eq('contractor_id', contractor.id);

  const { error } = await supabase.from('pipeline_stages').insert({
    contractor_id: contractor.id,
    name,
    sort_order: nextSortOrder(existing ?? []),
  });

  if (error) return { ok: false, error: 'Opslaan mislukt. Probeer opnieuw.' };
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
  return { ok: true };
}

export async function renameStage(id: string, form: FormData): Promise<StageActionResult> {
  const { supabase } = await requireContractor();
  const name = validateStageName(String(form.get('name') ?? ''));

  const { error } = await supabase.from('pipeline_stages').update({ name }).eq('id', id);
  if (error) return { ok: false, error: 'Opslaan mislukt. Probeer opnieuw.' };
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
  return { ok: true };
}

export async function deleteStage(id: string): Promise<StageActionResult> {
  const { supabase } = await requireContractor();

  const { count } = await supabase
    .from('quotes').select('id', { count: 'exact', head: true }).eq('pipeline_stage_id', id);

  const decision = canDeleteStage(count ?? 0);
  if (!decision.allowed) return { ok: false, error: decision.reason };

  const { error } = await supabase.from('pipeline_stages').delete().eq('id', id);
  if (error) return { ok: false, error: 'Verwijderen mislukt. Probeer opnieuw.' };
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
  return { ok: true };
}

export async function reorderStage(id: string, direction: 'up' | 'down'): Promise<StageActionResult> {
  const { supabase, contractor } = await requireContractor();

  const { data: stages } = await supabase
    .from('pipeline_stages').select('id, sort_order').eq('contractor_id', contractor.id);

  const swap = swapSortOrder(stages ?? [], id, direction);
  if (!swap) return { ok: true }; // already at the edge — nothing to do

  const applied: typeof swap[number][] = [];
  for (const item of swap) {
    const { error } = await supabase
      .from('pipeline_stages').update({ sort_order: item.sort_order }).eq('id', item.id);
    if (error) {
      // The swap is one logical operation split into two calls — if the second
      // fails after the first succeeded, best-effort revert the row(s) already
      // written so we don't leave two stages with inconsistent sort_order until
      // the next successful reorder. Revert failure is logged (non-fatal): we
      // still return the same generic error either way rather than masking it.
      for (const done of revertSwap(stages ?? [], applied)) {
        const { error: revertError } = await supabase
          .from('pipeline_stages').update({ sort_order: done.sort_order }).eq('id', done.id);
        if (revertError) {
          console.error('reorderStage: failed to revert sort_order for stage', done.id, revertError);
        }
      }
      return { ok: false, error: 'Herordenen mislukt. Probeer opnieuw.' };
    }
    applied.push(item);
  }
  revalidatePath('/instellingen');
  revalidatePath('/pijplijn');
  return { ok: true };
}
