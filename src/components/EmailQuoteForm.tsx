'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { MailboxSummary, Quote } from '@/lib/supabase/types';

type Props = {
  quote: Quote;
  companyName: string;
  mailbox: MailboxSummary | null;
};

export default function EmailQuoteForm({ quote, companyName, mailbox }: Props) {
  const [recipient, setRecipient] = useState(quote.customer_email ?? '');
  const [subject, setSubject] = useState(`Offerte van ${companyName}`);
  const [message, setMessage] = useState(defaultMessage(quote.customer_name, companyName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!mailbox) {
    return (
      <section className="rounded border p-4">
        <h2 className="font-semibold">Offerte e-mailen</h2>
        <p className="mt-1 text-sm text-gray-600">
          Verbind eerst je Gmail- of Outlook-account om offertes vanuit je eigen mailbox te sturen.
        </p>
        <Link href="/instellingen" className="mt-3 inline-block rounded border px-3 py-2 text-sm">
          Mailbox verbinden
        </Link>
      </section>
    );
  }

  if (mailbox.status === 'disconnected') {
    return (
      <section className="rounded border border-amber-300 bg-amber-50 p-4">
        <h2 className="font-semibold">Mailbox opnieuw verbinden</h2>
        <p className="mt-1 text-sm text-amber-800">
          De toegang tot {mailbox.email_address} is verlopen.
        </p>
        <Link href="/instellingen" className="mt-3 inline-block rounded border px-3 py-2 text-sm">
          Naar instellingen
        </Link>
      </section>
    );
  }

  const connectedMailbox = mailbox;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/quotes/${quote.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient, subject, message }),
      });
      const body = (await response.json()) as { error?: string; from?: string };
      if (!response.ok) {
        setError(body.error ?? 'Versturen mislukt.');
        return;
      }
      setSuccess(`Offerte verstuurd naar ${recipient} vanuit ${body.from ?? connectedMailbox.email_address}.`);
    } catch {
      setError('Geen verbinding. Probeer opnieuw.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded border p-4">
      <div className="mb-4">
        <h2 className="font-semibold">Offerte e-mailen</h2>
        <p className="text-sm text-gray-600">
          Via {connectedMailbox.provider === 'gmail' ? 'Gmail' : 'Outlook'} · {connectedMailbox.email_address}
        </p>
      </div>

      <form onSubmit={send} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Aan
          <input
            type="email"
            required
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            className="rounded border p-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Onderwerp
          <input
            required
            maxLength={200}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="rounded border p-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Bericht
          <textarea
            required
            rows={7}
            maxLength={10_000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="rounded border p-3"
          />
        </label>

        <p className="text-xs text-gray-500">De offerte-pdf wordt automatisch toegevoegd.</p>

        {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {success && <p role="status" className="rounded bg-green-50 p-3 text-sm text-green-800">{success}</p>}

        <button
          type="submit"
          disabled={busy}
          className="rounded bg-black p-3 text-white disabled:opacity-50"
        >
          {busy ? 'Versturen…' : 'Offerte versturen'}
        </button>
      </form>
    </section>
  );
}

function defaultMessage(customerName: string | null, companyName: string): string {
  const greeting = customerName ? `Beste ${customerName},` : 'Beste,';
  return `${greeting}\n\nIn bijlage vind je onze offerte. Heb je nog vragen, laat het gerust weten.\n\nMet vriendelijke groeten,\n${companyName}`;
}
