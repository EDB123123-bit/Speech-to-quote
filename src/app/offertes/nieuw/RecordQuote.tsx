'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import VoiceRecorder from '@/components/VoiceRecorder';
import Icon from '@/components/ui/Icon';

export default function RecordQuote(props?: { hasCatalogItems?: boolean; parentQuoteId?: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastRecording, setLastRecording] = useState<Blob | null>(null);

  async function upload(audio: Blob) {
    setStatus('uploading');
    setError(null);

    const form = new FormData();
    form.append('audio', audio, 'opname.webm');
    if (props?.parentQuoteId) form.append('parentQuoteId', props.parentQuoteId);

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
    <div className="flex flex-col gap-5">
      {status !== 'uploading' ? (
        <>
          <div className="example-card">
            <p className="eyebrow">Bijvoorbeeld</p>
            <ul>
              <li>“45 vierkante meter pannen vernieuwen.”</li>
              <li>“12 meter dakgoot vervangen in zink.”</li>
              <li>“Twee dagen werk, met container.”</li>
              <li>“Het gebouw is ouder dan tien jaar.”</li>
            </ul>
          </div>
          <div data-tour="record-button" className="record-card">
            <VoiceRecorder
              onRecorded={onRecorded}
              label="Tik om te beginnen"
              variant="hero"
            />
          </div>
        </>
      ) : (
        <section aria-live="polite">
          <h2 className="mb-2 text-2xl">Ik maak je offerte.</h2>
          <p className="page-subtitle mb-5">Dit duurt ongeveer een halve minuut. Je mag je telefoon wegleggen.</p>
          <div className="processing-panel">
            <div className="processing-step"><span className="step-icon"><Icon name="check" size={19} /></span>Opname bewaard</div>
            <div className="processing-step"><span className="step-icon"><Icon name="check" size={19} /></span>Uitgeschreven wat je zei</div>
            <div className="processing-step"><span className="step-icon is-loading"><span className="spinner" /></span>Je job-specifieke prijzen verwerken</div>
          </div>
          <p className="mt-4 rounded-3xl bg-[var(--paper-strong)] p-5 font-semibold leading-relaxed text-muted">
            Loopt het mis? Je opname blijft staan. Je kan ze opnieuw laten verwerken.
          </p>
        </section>
      )}

      {status === 'error' && (
        <div className="flex flex-col gap-3">
          <p role="alert" className="alert alert-critical">{error}</p>
          {lastRecording && (
            <button
              type="button"
              onClick={() => void upload(lastRecording)}
              className="btn btn-outline"
            >
              Opnieuw proberen
            </button>
          )}
        </div>
      )}
    </div>
  );
}
