'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  createQuoteTask,
  deleteQuoteTask,
  updateQuoteTask,
} from '@/app/taken/actions';
import type { QuoteStatus, QuoteTask } from '@/lib/supabase/types';

type Props = {
  quoteId: string;
  quoteStatus: QuoteStatus;
  initialTasks: QuoteTask[];
};

export default function QuoteTasksPanel({ quoteId, quoteStatus, initialTasks }: Props) {
  const router = useRouter();
  const [message, setMessage] = useState('');

  async function run(action: () => Promise<void>, successMessage: string): Promise<void> {
    setMessage('');
    try {
      await action();
      setMessage(successMessage);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Taakbewerking mislukt.');
    }
  }

  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="eyebrow">Interne voorbereiding</p>
          <h2 className="section-heading">Taken</h2>
          <p className="section-copy">
            {quoteStatus === 'accepted'
              ? 'Deze taken zijn actief en staan ook in het centrale takenoverzicht.'
              : 'Je kunt taken voorbereiden. Ze verschijnen pas in Taken nadat de offerte is aanvaard.'}
          </p>
        </div>
        <span className={`badge ${quoteStatus === 'accepted' ? 'badge-success' : 'badge-neutral'}`}>
          {quoteStatus === 'accepted' ? 'Actief' : 'Voorbereid'}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {initialTasks.map((task) => {
          const updateAction = updateQuoteTask.bind(null, task.id);
          const deleteAction = deleteQuoteTask.bind(null, task.id);
          return (
            <div key={task.id} className="rounded-2xl bg-paper-strong p-4">
              <form
                action={(form) => run(() => updateAction(form), 'Taak opgeslagen.')}
                className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_180px_140px_auto] sm:items-end"
              >
                <label className="label flex flex-col gap-1">
                  Titel
                  <input className="field min-h-12" name="title" required maxLength={200} defaultValue={task.title} />
                </label>
                <label className="label flex flex-col gap-1">
                  Deadline
                  <input className="field min-h-12" name="due_date" type="date" defaultValue={task.due_date ?? ''} />
                </label>
                <label className="label flex flex-col gap-1">
                  Status
                  <select className="field min-h-12" name="status" defaultValue={task.status}>
                    <option value="todo">Te doen</option>
                    <option value="done">Klaar</option>
                  </select>
                </label>
                <button className="btn btn-outline min-h-12" type="submit">Opslaan</button>
              </form>
              <form action={() => run(deleteAction, 'Taak verwijderd.')} className="mt-2 flex justify-end">
                <button className="text-sm font-bold text-critical underline" type="submit">Verwijderen</button>
              </form>
            </div>
          );
        })}
        {initialTasks.length === 0 && (
          <p className="rounded-2xl bg-paper-strong p-4 text-sm font-medium text-muted">Nog geen taken voorbereid.</p>
        )}
      </div>

      <form
        action={(form) => run(() => createQuoteTask(quoteId, form), 'Taak toegevoegd.')}
        className="mt-4 grid gap-3 rounded-2xl border-2 border-dashed border-border p-4 sm:grid-cols-[minmax(0,1fr)_180px_auto] sm:items-end"
      >
        <label className="label flex flex-col gap-1">
          Nieuwe taak
          <input className="field min-h-12" name="title" required maxLength={200} placeholder="Bijvoorbeeld: werfbezoek plannen" />
        </label>
        <label className="label flex flex-col gap-1">
          Deadline
          <input className="field min-h-12" name="due_date" type="date" />
        </label>
        <button className="btn btn-primary min-h-12" type="submit">Taak toevoegen</button>
      </form>
      {message && <p role="status" className="mt-3 text-sm font-medium text-muted">{message}</p>}
    </section>
  );
}
