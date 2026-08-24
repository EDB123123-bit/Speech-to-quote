'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';

function orderQuantity(form: FormData): number | null {
  const raw = String(form.get('order_quantity') ?? '').trim().replace(',', '.');
  if (!raw) return null;
  const quantity = Number(raw);
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('Vul een geldige bestel hoeveelheid in.');
  return quantity;
}

export async function updateMaterialRequirement(requirementId: string, form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const supplierId = String(form.get('supplier_id') ?? '').trim() || null;
  const status = String(form.get('status') ?? 'to_order');
  if (status !== 'to_order') throw new Error('Materiaal wordt pas besteld nadat een leveranciersbestelling is verstuurd.');
  const { data: assignment } = await supabase
    .from('supplier_order_lines')
    .select('supplier_order_id, supplier_orders!inner(status, cancelled_at)')
    .eq('material_requirement_id', requirementId)
    .eq('supplier_orders.status', 'draft')
    .is('supplier_orders.cancelled_at', null)
    .maybeSingle();
  if (assignment) throw new Error('Deze materiaalregel is al aan een conceptbestelling toegewezen.');
  const { data, error } = await supabase.from('material_requirements').update({
    order_quantity: orderQuantity(form), supplier_id: supplierId, status,
  }).eq('id', requirementId).eq('contractor_id', contractor.id).select('quote_id').single();
  if (error || !data) throw new Error('Materiaalvereiste opslaan mislukt.');
  revalidatePath('/te-bestellen');
  revalidatePath(`/offertes/${data.quote_id}`);
}
