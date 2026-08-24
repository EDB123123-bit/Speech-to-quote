'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor } from '@/lib/auth/require-contractor';
import type { QuoteTaskStatus } from '@/lib/supabase/types';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;

function taskTitle(form: FormData): string {
  const title = String(form.get('title') ?? '').trim();
  if (!title || title.length > 200) {
    throw new Error('Een taak heeft een titel van maximaal 200 tekens nodig.');
  }
  return title;
}

function taskDueDate(form: FormData): string | null {
  const dueDate = String(form.get('due_date') ?? '').trim();
  const parsed = dueDate ? new Date(`${dueDate}T12:00:00Z`) : null;
  if (
    dueDate
    && (!ISO_DATE.test(dueDate) || !parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dueDate)
  ) {
    throw new Error('Vul een geldige deadline in.');
  }
  return dueDate || null;
}

function taskStatus(form: FormData): QuoteTaskStatus {
  const status = String(form.get('status') ?? 'todo');
  if (status !== 'todo' && status !== 'done') throw new Error('Ongeldige taakstatus.');
  return status;
}

function revalidateTaskViews(quoteId: string): void {
  revalidatePath(`/offertes/${quoteId}`);
  revalidatePath('/taken');
}

export async function createQuoteTask(quoteId: string, form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .select('id')
    .eq('id', quoteId)
    .eq('contractor_id', contractor.id)
    .single();

  if (quoteError || !quote) throw new Error('Offerte niet gevonden.');

  const { error } = await supabase.from('quote_tasks').insert({
    contractor_id: contractor.id,
    quote_id: quoteId,
    title: taskTitle(form),
    due_date: taskDueDate(form),
    status: 'todo',
  });

  if (error) throw new Error('Taak toevoegen mislukt.');
  revalidateTaskViews(quoteId);
}

export async function updateQuoteTask(taskId: string, form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const { data: task, error: fetchError } = await supabase
    .from('quote_tasks')
    .select('id, quote_id')
    .eq('id', taskId)
    .eq('contractor_id', contractor.id)
    .single();

  if (fetchError || !task) throw new Error('Taak niet gevonden.');

  const { error } = await supabase
    .from('quote_tasks')
    .update({
      title: taskTitle(form),
      due_date: taskDueDate(form),
      status: taskStatus(form),
    })
    .eq('id', taskId)
    .eq('contractor_id', contractor.id);

  if (error) throw new Error('Taak opslaan mislukt.');
  revalidateTaskViews(task.quote_id);
}

export async function setQuoteTaskStatus(taskId: string, status: QuoteTaskStatus): Promise<void> {
  if (status !== 'todo' && status !== 'done') throw new Error('Ongeldige taakstatus.');

  const { supabase, contractor } = await requireContractor();
  const { data: task, error } = await supabase
    .from('quote_tasks')
    .update({ status })
    .eq('id', taskId)
    .eq('contractor_id', contractor.id)
    .select('quote_id')
    .single();

  if (error || !task) throw new Error('Taakstatus opslaan mislukt.');
  revalidateTaskViews(task.quote_id);
}

export async function deleteQuoteTask(taskId: string): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const { data: task, error } = await supabase
    .from('quote_tasks')
    .delete()
    .eq('id', taskId)
    .eq('contractor_id', contractor.id)
    .select('quote_id')
    .single();

  if (error || !task) throw new Error('Taak verwijderen mislukt.');
  revalidateTaskViews(task.quote_id);
}
