'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GmailMessageSummary } from '@/lib/mailbox/gmail';

export default function GmailImportPicker() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<GmailMessageSummary[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [reconnect, setReconnect] = useState(false);

  const load = useCallback(async (nextQuery = '') => {
    setSearching(true); setError(''); setReconnect(false);
    try {
      const response = await fetch(`/api/mailbox/gmail/messages${nextQuery.trim() ? `?q=${encodeURIComponent(nextQuery.trim())}` : ''}`);
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? 'Gmail kon niet worden geladen.'); setReconnect(Boolean(body.reconnect)); setMessages([]); return; }
      setMessages(body.messages ?? []);
    } catch { setError('Geen verbinding met Gmail.'); }
    finally { setLoading(false); setSearching(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(''); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function importSelected() {
    if (!selected || importing) return;
    setImporting(true); setError('');
    try {
      const response = await fetch('/api/mailbox/gmail/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: selected }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? 'Importeren mislukt.'); setReconnect(Boolean(body.reconnect)); return; }
      if (body.quoteId) router.push(`/offertes/${body.quoteId}`);
    } catch { setError('Geen verbinding. Probeer opnieuw.'); }
    finally { setImporting(false); }
  }

  return <section className="card flex flex-col gap-5">
    <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void load(query); }}>
      <label className="sr-only" htmlFor="gmail-search">Zoek in Gmail</label>
      <input id="gmail-search" className="field flex-1" placeholder="Zoek afzender, onderwerp of tekst" value={query} onChange={(event) => setQuery(event.target.value)} />
      <button className="btn btn-outline" type="submit" disabled={searching}>{searching ? 'Zoeken…' : 'Zoeken'}</button>
    </form>
    {error && <div role="alert" className="alert alert-critical"><p>{error}</p>{reconnect && <a className="mt-2 inline-block font-bold underline" href="/api/mailbox/connect/gmail">Gmail opnieuw verbinden</a>}</div>}
    {loading ? <p className="text-muted">Gmail-berichten laden…</p> : messages.length === 0 && !error ? <p className="text-muted">Geen berichten gevonden.</p> : <div className="flex flex-col gap-2" role="radiogroup" aria-label="Gmail-berichten">
      {messages.map((message) => <label key={message.id} className={`cursor-pointer rounded-2xl border p-4 transition ${selected === message.id ? 'border-ink bg-paper' : 'border-line bg-white'}`}>
        <span className="flex items-start gap-3"><input type="radio" name="gmail-message" value={message.id} checked={selected === message.id} onChange={() => setSelected(message.id)} className="mt-1" /><span className="min-w-0 flex-1"><span className="flex flex-wrap justify-between gap-2"><strong className="truncate">{message.subject}</strong><time className="text-sm text-muted" dateTime={message.receivedAt}>{formatDate(message.receivedAt)}</time></span><span className="mt-1 block text-sm font-semibold text-muted">{message.sender}</span><span className="mt-1 block line-clamp-2 text-sm text-muted">{message.snippet || 'Geen voorbeeld beschikbaar.'}</span></span></span>
      </label>)}
    </div>}
    <button className="btn btn-primary w-full" type="button" disabled={!selected || importing} onClick={() => void importSelected()}>{importing ? 'Importeren…' : 'Importeren als offerte'}</button>
    <p className="text-xs text-muted">Er wordt niets automatisch ingelezen. Alleen het geselecteerde bericht wordt gebruikt.</p>
  </section>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('nl-BE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
