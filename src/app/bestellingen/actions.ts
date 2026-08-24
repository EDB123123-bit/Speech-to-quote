'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContractor } from '@/lib/auth/require-contractor';

function required(form: FormData, key: string): string {
  const value = String(form.get(key) ?? '').trim();
  if (!value) throw new Error(`Ontbrekend veld: ${key}.`);
  return value;
}

function optional(form: FormData, key: string): string | null {
  const value = String(form.get(key) ?? '').trim();
  return value || null;
}

function quantity(value: string): number {
  const parsed = Number(value.trim().replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Vul geldige aantallen in.');
  return parsed;
}

function purchasePriceCents(value: string): number | null {
  const raw = value.trim().replace(',', '.');
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error('Vul geldige inkoopprijzen in.');
  return Math.round(parsed * 100);
}

function orderNumber(): string {
  return `BO-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function createSupplierOrder(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const quoteId = required(form, 'quote_id');
  const supplierId = required(form, 'supplier_id');
  const requirementIds = form.getAll('requirement_ids').map(String).map((value) => value.trim()).filter(Boolean);
  if (requirementIds.length === 0) throw new Error('Selecteer minstens één materiaalregel.');

  const { data: quote } = await supabase.from('quotes').select('customer_address').eq('id', quoteId).eq('contractor_id', contractor.id).single();
  if (!quote) throw new Error('Offerte niet gevonden.');

  const { data, error } = await supabase.rpc('create_supplier_order', {
    p_contractor_id: contractor.id,
    p_quote_id: quoteId,
    p_supplier_id: supplierId,
    p_requirement_ids: requirementIds,
    p_order_number: orderNumber(),
    p_delivery_address: quote.customer_address,
  });
  if (error || !data) throw new Error(error?.message ?? 'Conceptbestelling aanmaken mislukt.');

  revalidatePath('/te-bestellen');
  revalidatePath('/bestellingen');
  redirect(`/bestellingen/${String(data)}`);
}

export async function saveSupplierOrderDraft(form: FormData): Promise<void> {
  const { supabase } = await requireContractor();
  const orderId = required(form, 'order_id');
  const supplierId = required(form, 'supplier_id');
  const lineIds = form.getAll('line_id').map(String).map((value) => value.trim()).filter(Boolean);
  if (lineIds.length === 0) throw new Error('Een bestelling moet minstens één regel bevatten.');

  const lines = lineIds.map((id, index) => ({
    id,
    description: required(form, `line_${id}_description`),
    quantity: quantity(required(form, `line_${id}_quantity`)),
    unit: optional(form, `line_${id}_unit`),
    purchase_unit_price_cents: purchasePriceCents(String(form.get(`line_${id}_purchase_price`) ?? '')),
    sort_order: index,
  }));

  const { error } = await supabase.rpc('save_supplier_order_draft', {
    p_order_id: orderId,
    p_supplier_id: supplierId,
    p_delivery_address: optional(form, 'delivery_address'),
    p_notes: optional(form, 'notes'),
    p_lines: lines,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/bestellingen/${orderId}`);
  revalidatePath('/bestellingen');
  revalidatePath('/te-bestellen');
}

export async function cancelSupplierOrder(form: FormData): Promise<void> {
  const { supabase } = await requireContractor();
  const orderId = required(form, 'order_id');
  const { error } = await supabase.rpc('cancel_supplier_order', { p_order_id: orderId });
  if (error) throw new Error(error.message);
  revalidatePath('/te-bestellen');
  revalidatePath('/bestellingen');
  revalidatePath(`/bestellingen/${orderId}`);
}

export async function deleteSupplierOrder(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const orderId = required(form, 'order_id');
  const { error } = await supabase
    .from('supplier_orders')
    .delete()
    .eq('id', orderId)
    .eq('contractor_id', contractor.id)
    .eq('status', 'draft');
  if (error) throw new Error(error.message);
  revalidatePath('/te-bestellen');
  revalidatePath('/bestellingen');
  redirect('/bestellingen');
}
