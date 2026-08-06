'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import VoiceRecorder from '@/components/VoiceRecorder';

export default function RecordQuote({ hasCatalogItems }: { hasCatalogItems: boolean }) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastRecording, setLastRecording] = useState<Blob | null>(null);

  async function upload(audio: Blob) {
    setStatus('uploading');
    setError(null);

    const form = new FormData();
    form.append('audio', audio, 'opname.webm');

    try {
      const response = await fetch('/api/quotes/generate', { method: 'POST', body: form });
      const body = await response.json();

      if (response.ok) {
        router.push(`/offertes/${body.quoteId}`);
        return;
      }
      // Extraction failed but a draft exists — send them to it rather than
      // throwing away the recording they just made.
      if (body.quoteId) {
        router.push(`/offertes/${body.quoteId}`);
        return;
      }
      setError(body.error ?? 'Er ging iets mis. Probeer opnieuw.');
      setStatus('error');
    } catch {
      setError('Geen verbinding. Controleer je internetverbinding en probeer opnieuw.');
      setStatus('error');
    }
  }

  function onRecorded(audio: Blob) {
    setLastRecording(audio);
    void upload(audio);
  }

  return (
    <div className="flex flex-col gap-4">
      {!hasCatalogItems && (
        <p role="alert" className="rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          Stel eerst je prijslijst in bij Instellingen. Zonder prijzen kan er geen offerte gemaakt worden.
        </p>
      )}

      <VoiceRecorder
        onRecorded={onRecorded}
        label="Beschrijf de klus"
        disabled={!hasCatalogItems || status === 'uploading'}
      />

      {status === 'uploading' && <p className="text-sm text-gray-600">Bezig met verwerken…</p>}

      {status === 'error' && (
        <div className="flex flex-col gap-2">
          <p role="alert" className="text-sm text-red-600">{error}</p>
          {lastRecording && (
            <button
              type="button"
              onClick={() => void upload(lastRecording)}
              className="rounded border p-3"
            >
              Opnieuw proberen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
