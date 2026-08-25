'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { MailboxSummary, Quote, Supplier, SupplierOrder } from '@/lib/supabase/types';
import Icon from '@/components/ui/Icon';

export default function SupplierOrderEmailForm({ order, supplier, quote, companyName, mailbox }: {
  order: SupplierOrder;
  supplier: Supplier;
  quote: Quote;
  companyName: string;
  mailbox: MailboxSummary | null;
}) {
  const router = useRouter();
  const [recipient, setRecipient] = useState(supplier.email ?? '');
  const [subject, setSubject] = useState(`Bestelling ${order.order_number} · ${companyName}`);
  const [message, setMessage] = useState(defaultMessage(order, quote, supplier, companyName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!mailbox) return <section className="quote-sidebar-card"><h2 className="section-heading">Versturen naar leverancier</h2><p className="text-sm text-muted">Verbind eerst je mailbox om deze bestelling te versturen.</p><Link href="/instellingen#mailbox" className="btn btn-outline mt-3 w-full">Mailbox verbinden</Link></section>;
  if (!supplier.email) return <section className="alert alert-warning flex-col"><h2 className="text-lg">Leveranciersmail ontbreekt</h2><p className="text-sm">Voeg eerst een e-mailadres toe aan {supplier.company_name}.</p><Link href={`/leveranciers/${supplier.id}`} className="btn btn-outline mt-3">Leverancier aanpassen</Link></section>;
  const connectedMailbox = mailbox;

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(null); setSuccess(null);
    try {
      const response = await fetch(`/api/supplier-orders/${order.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipient, subject, message }) });
      const body = await response.json() as { error?: string; from?: string };
      if (!response.ok) { setError(body.error ?? 'Versturen mislukt.'); return; }
      setSuccess(`Bestelling verstuurd naar ${recipient} vanuit ${body.from ?? connectedMailbox.email_address}.`);
      router.refresh();
    } catch { setError('Geen verbinding. Probeer opnieuw.'); }
    finally { setBusy(false); }
  }

  return <section className="quote-sidebar-card"><div className="mb-4"><h2 className="section-heading">Versturen naar leverancier</h2><p className="text-sm text-muted">Via {connectedMailbox.provider === 'gmail' ? 'Gmail' : 'Outlook'} · {connectedMailbox.email_address}</p></div><form onSubmit={send} className="flex flex-col gap-3"><label className="label flex flex-col gap-2">Aan<input className="field" type="email" required value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label><label className="label flex flex-col gap-2">Onderwerp<input className="field" required maxLength={200} value={subject} onChange={(event) => setSubject(event.target.value)} /></label><label className="label flex flex-col gap-2">Bericht<textarea className="field" required maxLength={10000} rows={8} value={message} onChange={(event) => setMessage(event.target.value)} /></label><p className="text-xs font-semibold text-muted">De leveranciersbestelling-pdf wordt automatisch toegevoegd.</p>{error && <p role="alert" className="alert alert-critical">{error}</p>}{success && <p role="status" className="alert alert-success">{success}</p>}<button className="btn btn-primary" type="submit" disabled={busy}><Icon name="mail" size={21} />{busy ? 'Versturen…' : 'Verstuur naar leverancier'}</button></form></section>;
}

function defaultMessage(order: SupplierOrder, quote: Quote, supplier: Supplier, companyName: string): string {
  return `Beste ${supplier.contact_person || supplier.company_name},\n\nHierbij onze bestelling ${order.order_number} voor offerte ${quote.quote_number ?? quote.id.slice(0, 8).toUpperCase()} (${quote.customer_name ?? 'klant onbekend'}).\n\nMet vriendelijke groeten,\n${companyName}`;
}
