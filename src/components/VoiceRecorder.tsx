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
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled}
        aria-label={recording ? 'Stoppen' : label}
        className={`rounded p-4 text-lg text-white disabled:opacity-50 ${
          recording ? 'bg-red-600' : 'bg-black'
        }`}
      >
        {recording ? '■ Stoppen' : `● ${label}`}
      </button>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
