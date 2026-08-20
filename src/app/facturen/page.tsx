import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import type { Invoice } from '@/lib/supabase/types';
import { formatEuros } from '@/lib/money/totals';

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  const { supabase } = await requireContractor();
  const params = await searchParams;
  const { data } = await supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(100);
  const requestedStatus = params.status ?? 'all';
  const today = new Date().toISOString().slice(0, 10);
  const invoices = ((data ?? []) as Invoice[]).filter((invoice) => {
    const overdue = invoice.status === 'issued' && invoice.document_type === 'invoice' && !invoice.paid_at && !!invoice.due_date && invoice.due_date < today;
    const statusMatches = requestedStatus === 'all' || (requestedStatus === 'draft' && invoice.status === 'draft') || (requestedStatus === 'ready' && invoice.transport_status === 'ready') || (requestedStatus === 'paid' && !!invoice.paid_at) || (requestedStatus === 'overdue' && overdue) || (requestedStatus === 'credited' && invoice.status === 'credited');
    return statusMatches && (!params.q || `${invoice.invoice_number ?? ''} ${invoice.customer_name}`.toLocaleLowerCase('nl-BE').includes(params.q.toLocaleLowerCase('nl-BE')));
  });
  return <main className="page-shell">
    <header className="page-header"><div><p className="eyebrow">Administratie</p><h1 className="page-title">Facturen</h1><p className="page-subtitle">Maak van een afgewerkte offerte een Belgische factuur.</p></div></header>
    <form className="card mb-5 flex flex-wrap gap-3" method="get"><input name="q" defaultValue={params.q ?? ''} placeholder="Zoek nummer of klant" className="field min-h-12 flex-1" /><select name="status" defaultValue={requestedStatus} className="field min-h-12 w-auto"><option value="all">Alle facturen</option><option value="draft">Concepten</option><option value="ready">Klaar voor Peppol</option><option value="overdue">Vervallen</option><option value="paid">Betaald</option><option value="credited">Gecrediteerd</option></select><button className="btn btn-outline" type="submit">Filter</button></form>
    {invoices.length === 0 ? <div className="empty-state"><strong>{data && data.length > 0 ? 'Geen facturen gevonden' : 'Nog geen facturen'}</strong>{data && data.length > 0 ? 'Pas je filter aan.' : 'Maak eerst een factuur vanuit een afgewerkte offerte.'}</div> : <div className="quote-list">
      {invoices.map((invoice) => {
        const overdue = invoice.status === 'issued' && invoice.document_type === 'invoice' && !invoice.paid_at && !!invoice.due_date && invoice.due_date < today;
        return <Link key={invoice.id} href={`/facturen/${invoice.id}`} className="quote-card quote-card-link">
          <div><p className="quote-name">{invoice.invoice_number ?? 'Conceptfactuur'}</p><p className="quote-meta">{invoice.customer_name} · {invoice.issue_date ?? 'Nog niet uitgegeven'}</p></div>
          <div><p className="quote-amount">{formatEuros(invoice.document_type === 'credit_note' ? -invoice.total_cents : invoice.total_cents)}</p><p className="quote-status">{statusLabel(invoice, overdue)}</p></div>
        </Link>;
      })}
    </div>}
  </main>;
}

function statusLabel(invoice: Invoice, overdue: boolean): string {
  if (invoice.status === 'draft') return 'Concept';
  if (invoice.status === 'credited') return 'Gecrediteerd';
  if (invoice.paid_at) return 'Betaald';
  if (overdue) return 'Vervallen';
  if (invoice.transport_status === 'ready') return 'Klaar voor Peppol';
  if (invoice.transport_status === 'delivered') return 'Verstuurd';
  return 'Uitgegeven';
}
