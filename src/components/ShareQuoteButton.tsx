'use client';

import { useState } from 'react';
import Icon from '@/components/ui/Icon';

type Props = { quoteId: string; customerName: string | null };

export default function ShareQuoteButton({ quoteId, customerName }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setBusy(true);
    setError(null);
    const pdfUrl = `/api/quotes/${quoteId}/pdf`;

    try {
      const response = await fetch(pdfUrl);
      if (!response.ok) throw new Error('pdf');
      const blob = await response.blob();
      const filename = `Offerte ${customerName ?? quoteId.slice(0, 8)}.pdf`;
      const file = new File([blob], filename, { type: 'application/pdf' });

      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: filename, files: [file] });
        return;
      }

      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === 'AbortError') return;
      setError('Delen lukt niet. Download de pdf en stuur die zelf door.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => void share()} disabled={busy} className="btn btn-outline w-full">
        <Icon name="share" size={21} /> {busy ? 'Klaarmaken…' : 'Doorsturen via bericht'}
      </button>
      {error && <p role="alert" className="alert alert-critical mt-2">{error}</p>}
    </>
  );
}
