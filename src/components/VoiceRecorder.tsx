'use client';

import { useRef, useState } from 'react';

type Props = {
  onRecorded: (audio: Blob) => void;
  label?: string;
  disabled?: boolean;
};

export default function VoiceRecorder({ onRecorded, label = 'Opnemen', disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        onRecorded(new Blob(chunksRef.current, { type: 'audio/webm' }));
        setRecording(false);
      };

      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError(
        'Geen toegang tot de microfoon. Sta microfoontoegang toe in je browser, of vul de offerte handmatig in.',
      );
      setRecording(false);
    }
  }

  function stop() {
    recorderRef.current?.stop();
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled}
        aria-label={recording ? 'Stoppen' : label}
        className={`btn h-20 w-20 rounded-full text-2xl shadow-sm ${
          recording ? 'btn-danger animate-pulse' : 'btn-accent'
        }`}
      >
        {recording ? '■' : '●'}
      </button>
      <span className="text-sm font-medium text-muted">
        {recording ? 'Opname bezig — tik om te stoppen' : label}
      </span>
      {error && <p role="alert" className="alert alert-critical w-full">{error}</p>}
    </div>
  );
}
