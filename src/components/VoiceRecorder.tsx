'use client';

import { useEffect, useRef, useState } from 'react';
import Icon from '@/components/ui/Icon';

type Props = {
  onRecorded: (audio: Blob) => void;
  label?: string;
  disabled?: boolean;
  variant?: 'hero' | 'compact';
};

export default function VoiceRecorder({ onRecorded, label = 'Opnemen', disabled, variant = 'compact' }: Props) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setSeconds((current) => current + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

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
      setSeconds(0);
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

  const time = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className={`voice-recorder ${recording ? 'is-recording' : ''}`} data-variant={variant}>
      <div className="waveform" aria-hidden="true">
        {Array.from({ length: 11 }, (_, index) => <span key={index} />)}
      </div>
      <p className="voice-timer" aria-live="off">{time}</p>
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled}
        aria-label={recording ? 'Stoppen' : label}
        className={`voice-button ${recording ? 'is-recording' : ''}`}
      >
        {recording ? <span className="h-7 w-7 rounded-md bg-white" /> : <Icon name="microphone" size={variant === 'hero' ? 46 : 34} />}
      </button>
      <span className="voice-label">
        {recording ? 'Opname bezig — tik om te stoppen' : label}
      </span>
      {error && <p role="alert" className="alert alert-critical w-full">{error}</p>}
    </div>
  );
}
