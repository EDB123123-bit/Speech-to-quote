'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { MailboxSummary, Quote } from '@/lib/supabase/types';
import Icon from '@/components/ui/Icon';

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
      <section className="quote-sidebar-card">
        <h2 className="section-heading">Mailen naar de klant</h2>
        <p className="mt-1 text-sm font-medium leading-relaxed text-muted">
          Verbind eerst je Gmail- of Outlook-account om offertes vanuit je eigen mailbox te sturen.
        </p>
        <Link href="/instellingen" className="btn btn-outline mt-3 w-full">
          Mailbox verbinden
        </Link>
      </section>
    );
  }

  if (mailbox.status === 'disconnected') {
    return (
      <section className="alert alert-warning flex-col">
        <h2 className="text-lg">Mailbox opnieuw verbinden</h2>
        <p className="mt-1 text-sm">
          De toegang tot {mailbox.email_address} is verlopen.
        </p>
        <Link href="/instellingen#mailbox" className="btn btn-outline mt-3 w-full">
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
    <section className="quote-sidebar-card">
      <div className="mb-4">
        <h2 className="section-heading">Mailen naar de klant</h2>
        <p className="text-sm font-medium text-muted">
          Via {connectedMailbox.provider === 'gmail' ? 'Gmail' : 'Outlook'} · {connectedMailbox.email_address}
        </p>
      </div>

      <form onSubmit={send} className="flex flex-col gap-3">
        <label className="label flex flex-col gap-2">
          Aan
          <input
            type="email"
            required
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            className="field"
          />
        </label>
        <label className="label flex flex-col gap-2">
          Onderwerp
          <input
            required
            maxLength={200}
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            className="field"
          />
        </label>
        <label className="label flex flex-col gap-2">
          Bericht
          <textarea
            required
            rows={7}
            maxLength={10_000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="field"
          />
        </label>

        <p className="text-xs font-semibold text-muted">De offerte-pdf wordt automatisch toegevoegd.</p>

        {error && <p role="alert" className="alert alert-critical">{error}</p>}
        {success && <p role="status" className="alert alert-success">{success}</p>}

        <button
          type="submit"
          disabled={busy}
          className="btn btn-primary"
        >
          <Icon name="mail" size={21} /> {busy ? 'Versturen…' : 'Offerte versturen'}
        </button>
      </form>
    </section>
  );
}

function defaultMessage(customerName: string | null, companyName: string): string {
  const greeting = customerName ? `Beste ${customerName},` : 'Beste,';
  return `${greeting}\n\nIn bijlage vind je onze offerte. Heb je nog vragen, laat het gerust weten.\n\nMet vriendelijke groeten,\n${companyName}`;
}
