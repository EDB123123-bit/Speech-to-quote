'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { Invoice, MailboxSummary } from '@/lib/supabase/types';

export default function InvoiceEmailForm({ invoice, mailbox, companyName }: { invoice: Invoice; mailbox: MailboxSummary | null; companyName: string }) {
  const [recipient, setRecipient] = useState(invoice.customer_email ?? '');
  const [subject, setSubject] = useState(`Factuur ${invoice.invoice_number ?? ''} van ${companyName}`);
  const [message, setMessage] = useState(`Beste ${invoice.customer_name},\n\nIn bijlage vind je factuur ${invoice.invoice_number ?? ''}.\n\nMet vriendelijke groeten,\n${companyName}`);
  const [state, setState] = useState<{ message: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!mailbox) return <section className="quote-sidebar-card"><h2 className="section-heading">Factuur mailen</h2><p className="text-sm text-muted">Verbind eerst je Gmail- of Outlook-account.</p><Link href="/instellingen#mailbox" className="btn btn-outline mt-3 w-full">Mailbox verbinden</Link></section>;
  if (mailbox.status === 'disconnected') return <section className="alert alert-warning flex-col"><h2 className="section-heading">Mailbox opnieuw verbinden</h2><p>De toegang tot {mailbox.email_address} is verlopen.</p><Link href="/instellingen#mailbox" className="btn btn-outline">Opnieuw verbinden</Link></section>;
  const connectedMailbox = mailbox;
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setState(null);
    try {
      const response = await fetch(`/api/invoices/${invoice.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient, subject, message }) });
      const body = await response.json() as { error?: string; from?: string };
      setState(response.ok ? { message: `Verstuurd vanuit ${body.from ?? connectedMailbox.email_address}.`, error: false } : { message: body.error ?? 'Versturen mislukt.', error: true });
    } catch { setState({ message: 'Geen verbinding. Probeer opnieuw.', error: true }); } finally { setBusy(false); }
  }
  return <section className="quote-sidebar-card"><h2 className="section-heading">Factuur mailen</h2><form onSubmit={send} className="flex flex-col gap-3"><label className="label flex flex-col gap-2">Aan<input type="email" required value={recipient} onChange={(e) => setRecipient(e.target.value)} className="field" /></label><label className="label flex flex-col gap-2">Onderwerp<input required value={subject} onChange={(e) => setSubject(e.target.value)} className="field" /></label><label className="label flex flex-col gap-2">Bericht<textarea required rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className="field" /></label>{state && <p className={`alert ${state.error ? 'alert-critical' : 'alert-success'}`}>{state.message}</p>}<button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Versturen…' : 'Factuur versturen'}</button></form></section>;
}
