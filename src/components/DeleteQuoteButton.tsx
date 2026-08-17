'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { deleteQuote } from '@/app/offertes/quote-actions';

type Props = { quoteId: string; redirectTo?: string; compact?: boolean };

export default function DeleteQuoteButton({ quoteId, redirectTo, compact = false }: Props) {
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
        aria-label={compact ? (busy ? 'Offerte verwijderen…' : 'Offerte verwijderen') : undefined}
        className={compact
          ? 'flex h-9 w-9 items-center justify-center rounded-full bg-surface text-lg font-bold text-muted hover:text-critical disabled:opacity-50'
          : 'text-sm font-bold text-critical underline underline-offset-2 disabled:opacity-50'}
      >
        {compact ? (busy ? '…' : '×') : busy ? 'Verwijderen…' : 'Verwijderen'}
      </button>
      {error && <p role="alert" className="text-xs text-critical">{error}</p>}
    </div>
  );
}
