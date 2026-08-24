import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContractor } from '@/lib/auth/require-contractor';
import { getMailboxSummary } from '@/lib/mailbox/connection';
import { cancelSupplierOrder, deleteSupplierOrder, saveSupplierOrderDraft } from '../actions';
import SupplierOrderEmailForm from '@/components/SupplierOrderEmailForm';
import type { Quote, Supplier, SupplierOrder, SupplierOrderLine } from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

export default async function SupplierOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, contractor } = await requireContractor();
  const [{ data: order }, { data: lines }, { data: suppliers }, mailbox] = await Promise.all([
    supabase.from('supplier_orders').select('*').eq('id', id).eq('contractor_id', contractor.id).maybeSingle(),
    supabase.from('supplier_order_lines').select('*').eq('supplier_order_id', id).order('sort_order'),
    supabase.from('suppliers').select('id, company_name').eq('contractor_id', contractor.id).order('company_name'),
    getMailboxSummary(contractor.id),
  ]);
  if (!order) notFound();
  const typedOrder = order as SupplierOrder;
  const [{ data: linkedSupplier }, { data: linkedQuote }] = await Promise.all([
    supabase.from('suppliers').select('*').eq('id', typedOrder.supplier_id).eq('contractor_id', contractor.id).maybeSingle(),
    supabase.from('quotes').select('*').eq('id', typedOrder.quote_id).eq('contractor_id', contractor.id).maybeSingle(),
  ]);
  if (!linkedSupplier || !linkedQuote) notFound();
  const typedSupplier = linkedSupplier as Supplier;
  const typedQuote = linkedQuote as Quote;
  const typedLines = (lines ?? []) as unknown as SupplierOrderLine[];
  const isDraft = typedOrder.status === 'draft' && !typedOrder.cancelled_at;
  const isCancelled = Boolean(typedOrder.cancelled_at);

  return <main className="page-shell">
    <Link href="/bestellingen" className="back-link">← Terug naar bestellingen</Link>
    <header className="page-header"><div><p className="eyebrow">Leveranciersbestelling</p><h1 className="page-title">{typedOrder.order_number}</h1><p className="page-subtitle">{typedSupplier.company_name} · Offerte {typedQuote.quote_number ?? typedQuote.id.slice(0, 8).toUpperCase()}</p></div><span className={`badge ${typedOrder.cancelled_at ? 'badge-warning' : typedOrder.status === 'sent' ? 'badge-success' : 'badge-neutral'}`}>{typedOrder.cancelled_at ? 'Geannuleerd' : typedOrder.status === 'sent' ? 'Verzonden' : 'Concept'}</span></header>
    {isDraft ? <div className="quote-workspace"><div className="quote-main"><form action={saveSupplierOrderDraft} className="flex flex-col gap-5"><input type="hidden" name="order_id" value={typedOrder.id} /><section className="card grid gap-4 sm:grid-cols-2"><h2 className="section-heading sm:col-span-2">Bestelgegevens</h2><label className="label flex flex-col gap-2 sm:col-span-2">Leverancier<select className="field" name="supplier_id" defaultValue={typedOrder.supplier_id}>{(suppliers ?? []).map((item) => <option key={item.id} value={item.id}>{item.company_name}</option>)}</select></label><label className="label flex flex-col gap-2 sm:col-span-2">Leveradres<textarea className="field min-h-24" name="delivery_address" defaultValue={typedOrder.delivery_address ?? ''} /></label><label className="label flex flex-col gap-2 sm:col-span-2">Interne notitie<textarea className="field min-h-24" name="notes" defaultValue={typedOrder.notes ?? ''} /></label></section><section className="card"><h2 className="section-heading">Bestellijnen</h2><p className="section-copy">Deze lijnen zijn afkomstig uit de gekozen offerte. Wijzigingen hier wijzigen nooit de klantofferte.</p><div className="flex flex-col gap-4">{typedLines.map((line) => <OrderLineFields key={line.id} line={line} />)}</div></section><div className="flex flex-wrap gap-3"><button className="btn btn-primary" type="submit">Concept opslaan</button><a className="btn btn-outline" href={`/api/supplier-orders/${typedOrder.id}/pdf`}>Pdf-voorbeeld</a></div></form><div className="mt-5 flex flex-wrap gap-3"><form action={cancelSupplierOrder}><input type="hidden" name="order_id" value={typedOrder.id} /><button className="btn btn-quiet" type="submit">Bestelling annuleren</button></form><form action={deleteSupplierOrder}><input type="hidden" name="order_id" value={typedOrder.id} /><button className="btn btn-danger" type="submit">Concept verwijderen</button></form></div></div><aside className="quote-sidebar"><SupplierOrderEmailForm order={typedOrder} supplier={typedSupplier} quote={typedQuote} companyName={contractor.company_name} mailbox={mailbox} /></aside></div> : isCancelled ? <div className="card"><h2 className="section-heading">Bestelling geannuleerd</h2><p className="section-copy">De materiaalregels zijn vrijgegeven en staan opnieuw bij <Link className="underline" href="/te-bestellen">Te bestellen</Link>.</p></div> : <div className="flex flex-col gap-5"><section className="card grid gap-3 sm:grid-cols-2"><div><p className="label">Leverancier</p><p>{typedSupplier.company_name}</p><p className="text-muted">{typedSupplier.address ?? 'Geen adres'}</p>{typedSupplier.vat_number && <p className="text-muted">BTW {typedSupplier.vat_number}</p>}</div><div><p className="label">Klant / offerte</p><Link className="font-bold underline" href={`/offertes/${typedQuote.id}`}>{typedQuote.quote_number ?? typedQuote.id.slice(0, 8).toUpperCase()} · {typedQuote.customer_name ?? 'Klant onbekend'}</Link><p className="text-muted">{typedQuote.quote_kind === 'meerwerk' ? 'Meerwerkofferte' : 'Standaardofferte'}</p><p className="text-muted">Levering: {typedOrder.delivery_address ?? typedQuote.customer_address ?? 'Geen adres'}</p></div></section><section className="card"><h2 className="section-heading">Document</h2><p className="section-copy">Deze leveranciersbestelling is na verzending commercieel bevroren.</p><a className="btn btn-outline" href={`/api/supplier-orders/${typedOrder.id}/pdf`}>Pdf downloaden</a></section><section className="card"><h2 className="section-heading">Bestellijnen</h2>{typedLines.map((line) => <div key={line.id} className="totals-row"><span>{line.description} · {formatQuantity(line.quantity)} {line.unit ?? ''}</span><span>{line.purchase_unit_price_cents === null ? '—' : formatEuros(line.purchase_unit_price_cents)}</span></div>)}</section></div>}
  </main>;
}

function OrderLineFields({ line }: { line: SupplierOrderLine }) {
  return <div className="grid gap-3 rounded-2xl bg-paper p-4 sm:grid-cols-2"><input type="hidden" name="line_id" value={line.id} /><label className="label flex flex-col gap-1 sm:col-span-2">Omschrijving<input className="field" name={`line_${line.id}_description`} required defaultValue={line.description} /></label><label className="label flex flex-col gap-1">Aantal<input className="field" name={`line_${line.id}_quantity`} required type="number" min="0" step="any" defaultValue={line.quantity} /></label><label className="label flex flex-col gap-1">Eenheid<input className="field" name={`line_${line.id}_unit`} defaultValue={line.unit ?? ''} /></label><label className="label flex flex-col gap-1 sm:col-span-2">Inkoopprijs per eenheid (€)<input className="field" name={`line_${line.id}_purchase_price`} type="number" min="0" step="0.01" defaultValue={line.purchase_unit_price_cents === null ? '' : (line.purchase_unit_price_cents / 100).toFixed(2)} placeholder="Optioneel" /><span className="text-xs text-muted">Leeg betekent onbekend; €0 blijft een expliciete nulprijs.</span></label></div>;
}

function formatQuantity(value: number): string { return new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 3 }).format(value); }
function formatEuros(cents: number): string { return new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(cents / 100); }
