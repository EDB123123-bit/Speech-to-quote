'use client';

import { useState } from 'react';
import type { PipelineStage } from '@/lib/supabase/types';
import { createStage, deleteStage, renameStage, reorderStage } from './pipeline-stage-actions';

export default function PipelineStagesForm({ stages }: { stages: PipelineStage[] }) {
  const [error, setError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);

  async function handleAdd(form: FormData) {
    setAddError(null);
    try {
      await createStage(form);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Opslaan mislukt.');
    }
  }

  async function handleRename(id: string, form: FormData) {
    setError(null);
    try {
      await renameStage(id, form);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opslaan mislukt.');
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteStage(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  async function handleReorder(id: string, direction: 'up' | 'down') {
    setError(null);
    try {
      await reorderStage(id, direction);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Herordenen mislukt. Probeer opnieuw.');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-2">
        {sorted.length === 0 && (
          <li className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted">
            Nog geen fasen ingesteld.
          </li>
        )}
        {sorted.map((stage, index) => (
          <li key={stage.id} className="card flex items-center gap-2">
            <div className="flex flex-col">
              <button
                type="button"
                aria-label={`${stage.name} omhoog verplaatsen`}
                disabled={index === 0}
                onClick={() => void handleReorder(stage.id, 'up')}
                className="text-muted hover:text-ink disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                aria-label={`${stage.name} omlaag verplaatsen`}
                disabled={index === sorted.length - 1}
                onClick={() => void handleReorder(stage.id, 'down')}
                className="text-muted hover:text-ink disabled:opacity-30"
              >
                ▼
              </button>
            </div>

            <form
              action={(form) => void handleRename(stage.id, form)}
              className="flex flex-1 items-center gap-2"
            >
              <input name="name" defaultValue={stage.name} className="field" />
              <button type="submit" className="btn btn-outline text-sm">Opslaan</button>
            </form>

            <button
              type="button"
              onClick={() => void handleDelete(stage.id)}
              aria-label={`Verwijder ${stage.name}`}
              className="text-sm font-medium text-critical underline underline-offset-2"
            >
              Verwijderen
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="alert alert-critical">{error}</p>}

      <form action={handleAdd} className="card flex flex-col gap-3">
        <h3 className="font-semibold">Nieuwe fase toevoegen</h3>
        <input name="name" required placeholder="Naam (bv. Verzonden naar klant)" className="field" />
        {addError && <p role="alert" className="alert alert-critical">{addError}</p>}
        <button type="submit" className="btn btn-primary">Toevoegen</button>
      </form>
    </div>
  );
}
