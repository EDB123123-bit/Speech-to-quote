'use client';

import { useState } from 'react';
import VoiceRecorder from '@/components/VoiceRecorder';
import type { QuoteClarification } from '@/lib/supabase/types';
import { dismissClarification } from '@/app/offertes/[id]/clarification-actions';

type Props = {
  quoteId: string;
  clarifications: QuoteClarification[];
  onResolved: () => void;
};

type LocalState = { question: string; status: string; capped: boolean };

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
    await dismissClarification(clarificationId);
    setLocal((prev) => ({
      ...prev,
      [clarificationId]: { ...stateOf(clarifications.find((c) => c.id === clarificationId)!), status: 'dismissed' },
    }));
    onResolved();
  }

  if (pending.length === 0) {
    return (
      <p className="rounded border border-green-300 bg-green-50 p-4 text-sm">
        Alle vragen beantwoord. Je kan de offerte afwerken.
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded border border-amber-300 bg-amber-50 p-4">
      <h2 className="font-semibold">
        Te verduidelijken (<span data-testid="pending-count">{pending.length}</span>)
      </h2>
      <p className="text-sm text-gray-700">
        Beantwoord deze vragen hardop, of vul ze hieronder handmatig aan.
      </p>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <ul className="flex flex-col gap-4">
        {pending.map((item) => {
          const state = stateOf(item);
          return (
            <li key={item.id} className="rounded border bg-white p-3">
              <p className="mb-2 font-medium">{state.question}</p>

              {state.capped && (
                <p className="mb-2 text-sm text-amber-800">
                  Ik begrijp het antwoord niet. Vul dit handmatig aan bij de offertelijnen.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void playQuestion(item.id)}
                  className="rounded border px-3 py-2 text-sm"
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
                  className="text-sm underline"
                >
                  Niet van toepassing
                </button>
              </div>

              {busyId === item.id && <p className="mt-2 text-sm text-gray-600">Bezig met verwerken…</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
