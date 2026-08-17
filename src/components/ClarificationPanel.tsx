'use client';

import { useState } from 'react';
import VoiceRecorder from '@/components/VoiceRecorder';
import type { ClarificationStatus, QuoteClarification } from '@/lib/supabase/types';
import { dismissClarification } from '@/app/offertes/[id]/clarification-actions';
import Icon from '@/components/ui/Icon';

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
        <Icon name="check" size={20} />
        Alle vragen beantwoord. Je kan de offerte afwerken.
      </p>
    );
  }

  return (
    <section className="clarification-card">
      <p className="eyebrow text-warning">Nog te doen</p>
      <h2>
        <span data-testid="pending-count" className="nums">{pending.length}</span>{' '}
        {pending.length === 1 ? 'vraag beantwoorden' : 'vragen beantwoorden'}
      </h2>
      <p className="mb-4 mt-1 text-sm font-semibold text-warning">
        Spreek je antwoord in of duid aan dat de vraag niet nodig is.
      </p>

      {error && <p role="alert" className="alert alert-critical">{error}</p>}

      <ul>
        {pending.map((item, index) => {
          const state = stateOf(item);
          return (
            <li key={item.id} className="clarification-item">
              <p className="eyebrow text-warning">Vraag {index + 1} van {pending.length}</p>
              <p className="clarification-question">{state.question}</p>

              {state.capped && (
                <p className="mb-3 text-sm text-warning">
                  Ik begrijp het antwoord niet. Vul dit handmatig aan bij de offertelijnen.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void playQuestion(item.id)}
                  className="btn btn-quiet"
                >
                  ▶ Vraag afspelen
                </button>

                <VoiceRecorder
                  onRecorded={(audio) => void submitAnswer(item.id, audio)}
                  label="Antwoord opnemen"
                  disabled={busyId === item.id}
                  variant="compact"
                />

                <button
                  type="button"
                  onClick={() => void dismiss(item.id)}
                  className="btn btn-quiet"
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
