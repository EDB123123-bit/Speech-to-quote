'use client';

import { useState } from 'react';

export default function PublicQuoteActions({ token, accepted }: { token: string; accepted: boolean }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(accepted);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return <p className="alert alert-success" role="status">Deze offerte is aanvaard. Bedankt voor je bevestiging.</p>;
  }

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/offerte/${encodeURIComponent(token)}/accept`, { method: 'POST' });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok) {
        setError(body.error ?? 'Aanvaarden lukt niet. Probeer opnieuw.');
        return;
      }
      setDone(true);
    } catch {
      setError('Geen verbinding. Probeer opnieuw.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="alert alert-critical" role="alert">{error}</p>}
      <button type="button" onClick={() => void accept()} disabled={busy} className="btn btn-primary w-full">
        {busy ? 'Aanvaarden…' : 'Offerte accepteren'}
      </button>
    </div>
  );
}
