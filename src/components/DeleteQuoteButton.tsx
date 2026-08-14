'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteQuote } from '@/app/offertes/quote-actions';

type Props = { quoteId: string; redirectTo?: string };

export default function DeleteQuoteButton({ quoteId, redirectTo }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm('Deze offerte definitief verwijderen? Dit kan niet ongedaan worden.')) return;

    setBusy(true);
    setError(null);
    try {
      await deleteQuote(quoteId);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    } catch {
      setError('Offerte verwijderen mislukt. Probeer opnieuw.');
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void remove()}
        disabled={busy}
        aria-busy={busy}
        className="text-sm font-medium text-critical underline underline-offset-2 disabled:opacity-50"
      >
        {busy ? 'Verwijderen…' : 'Verwijderen'}
      </button>
      {error && <p role="alert" className="text-xs text-critical">{error}</p>}
    </div>
  );
}
