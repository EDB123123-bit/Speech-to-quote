'use client';

import { useState } from 'react';
import VoiceRecorder from '@/components/VoiceRecorder';
import type { ClarificationStatus, QuoteClarification } from '@/lib/supabase/types';
import { dismissClarification } from '@/app/offertes/[id]/clarification-actions';

type Props = {
  quoteId: string;
  clarifications: QuoteClarification[];
  onResolved: () => void;
};

type LocalState = { question: string; status: ClarificationStatus; capped: boolean };

export default function ClarificationPanel({ quoteId, clarifications, onResolved }: Props) {
  const [local, setLocal] = useState<Record<string, LocalState>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function stateOf(item: QuoteClarification): LocalState {
    return local[item.id] ?? { question: item.question_nl, status: item.status, capped: false };
  }

  const pending = clarifications.filter((item) => stateOf(item).status === 'pending');

  async function playQuestion(clarificationId: string) {
    try {
      const response = await fetch(
        `/api/quotes/${quoteId}/clarifications/${clarificationId}/prompt-audio`,
      );
      if (!response.ok) return; // Text is on screen; silence is an acceptable fallback.
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      await new Audio(url).play();
      URL.revokeObjectURL(url);
    } catch {
      // Audio blocked or unsupported — the written question remains visible.
    }
  }

  async function submitAnswer(clarificationId: string, audio: Blob) {
    setBusyId(clarificationId);
    setError(null);

    const form = new FormData();
    form.append('audio', audio, 'antwoord.webm');

    try {
      const response = await fetch(
        `/api/quotes/${quoteId}/clarifications/${clarificationId}/answer`,
        { method: 'POST', body: form },
      );
      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? 'Verwerken mislukt. Probeer opnieuw.');
        return;
      }

      setLocal((prev) => ({
        ...prev,
        [clarificationId]: {
          question: body.question,
          status: body.resolved ? 'resolved' : 'pending',
          capped: !body.resolved && body.canRetry === false,
        },
      }));
      onResolved();
    } catch {
      setError('Geen verbinding. Probeer opnieuw.');
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(clarificationId: string) {
    const item = clarifications.find((c) => c.id === clarificationId);
    if (!item) return;

    setError(null);
    try {
      await dismissClarification(clarificationId);
      setLocal((prev) => ({
        ...prev,
        [clarificationId]: { ...stateOf(item), status: 'dismissed' },
      }));
      onResolved();
    } catch {
      setError('Verwijderen mislukt. Probeer opnieuw.');
    }
  }

  if (clarifications.length === 0) {
    return null;
  }

  if (pending.length === 0) {
    return (
      <p className="alert alert-success">
        Alle vragen beantwoord. Je kan de offerte afwerken.
      </p>
    );
  }

  return (
    <section className="card flex flex-col gap-3 border-warning/40 bg-warning-bg/40">
      <h2 className="font-semibold">
        Te verduidelijken (<span data-testid="pending-count" className="nums">{pending.length}</span>)
      </h2>
      <p className="text-sm text-muted">
        Beantwoord deze vragen hardop, of vul ze hieronder handmatig aan.
      </p>

      {error && <p role="alert" className="alert alert-critical">{error}</p>}

      <ul className="flex flex-col gap-4">
        {pending.map((item) => {
          const state = stateOf(item);
          return (
            <li key={item.id} className="card bg-surface">
              <p className="mb-3 font-medium">{state.question}</p>

              {state.capped && (
                <p className="mb-3 text-sm text-warning">
                  Ik begrijp het antwoord niet. Vul dit handmatig aan bij de offertelijnen.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void playQuestion(item.id)}
                  className="btn btn-outline"
                >
                  ▶ Vraag afspelen
                </button>

                <VoiceRecorder
                  onRecorded={(audio) => void submitAnswer(item.id, audio)}
                  label="Antwoord opnemen"
                  disabled={busyId === item.id}
                />

                <button
                  type="button"
                  onClick={() => void dismiss(item.id)}
                  className="text-sm font-medium text-muted underline underline-offset-2 hover:text-ink"
                >
                  Niet van toepassing
                </button>
              </div>

              {busyId === item.id && <p className="mt-3 text-sm text-muted">Bezig met verwerken…</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
