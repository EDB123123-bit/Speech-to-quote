import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContractor } from '@/lib/auth/require-contractor';
import { createInvoiceDraft } from '../actions';
import { normalizeUnitCode, parseAddress } from '@/lib/invoices/constants';
import type { Quote, QuoteLineItem } from '@/lib/supabase/types';

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ quote?: string }> }) {
  const { quote: quoteId } = await searchParams;
  if (!quoteId) notFound();
  const { supabase, contractor } = await requireContractor();
  const [{ data: quote }, { data: lines }] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', quoteId).eq('status', 'final').single(),
    supabase.from('quote_line_items').select('*').eq('quote_id', quoteId).order('sort_order'),
  ]);
  if (!quote) notFound();
  const typedQuote = quote as Quote;
  const address = parseAddress(typedQuote.customer_address);
  const today = new Date();
  const todayValue = today.toISOString().slice(0, 10);
  const dueValue = new Date(today.getTime() + (contractor.default_payment_term_days ?? 30) * 86400000).toISOString().slice(0, 10);
  return <main className="page-shell page-medium">
    <Link href={`/offertes/${quoteId}`} className="back-link">← Terug naar offerte</Link>
    <header className="page-header"><div><p className="eyebrow">Nieuwe factuur</p><h1 className="page-title">Gegevens controleren</h1><p className="page-subtitle">De factuur wordt pas definitief nadat je ze uitgeeft.</p></div></header>
    <form action={createInvoiceDraft} className="flex flex-col gap-5">
      <input type="hidden" name="quote_id" value={quoteId} />
      <section className="card grid gap-4 sm:grid-cols-2"><h2 className="section-heading sm:col-span-2">Klant</h2>
        <label className="label flex flex-col gap-2 sm:col-span-2">Type klant<select name="customer_type" defaultValue="private" className="field"><option value="private">Particulier (B2C)</option><option value="business">Onderneming (B2B / Peppol)</option></select></label>
        <label className="label flex flex-col gap-2 sm:col-span-2">Naam<input name="customer_name" required defaultValue={typedQuote.customer_name ?? ''} className="field" /></label>
        <label className="label flex flex-col gap-2 sm:col-span-2">Adres (voor PDF)<input name="customer_address" required defaultValue={typedQuote.customer_address ?? ''} className="field" /></label>
        <label className="label flex flex-col gap-2">Straat en nummer<input name="customer_street" required defaultValue={address.street} className="field" /></label>
        <label className="label flex flex-col gap-2">Postcode<input name="customer_postal_code" required defaultValue={address.postalCode} className="field" /></label>
        <label className="label flex flex-col gap-2">Gemeente<input name="customer_city" required defaultValue={address.city} className="field" /></label>
        <label className="label flex flex-col gap-2">Landcode<input name="customer_country_code" required defaultValue="BE" maxLength={2} className="field" /></label>
        <label className="label flex flex-col gap-2">E-mail<input name="customer_email" type="email" defaultValue={typedQuote.customer_email ?? ''} className="field" /></label>
        <label className="label flex flex-col gap-2">Telefoon<input name="customer_phone" defaultValue={typedQuote.customer_phone ?? ''} className="field" /></label>
        <label className="label flex flex-col gap-2">BTW-nummer<input name="customer_vat_number" placeholder="BE0123456789" className="field nums" /></label>
        <label className="label flex flex-col gap-2">KBO-nummer<input name="customer_enterprise_number" placeholder="0123.456.789" className="field nums" /></label>
        <p className="section-copy sm:col-span-2">Voor B2B wordt de Peppol-ID uitsluitend als <strong>0208:KBO-nummer</strong> afgeleid.</p>
      </section>
      <section className="card grid gap-4 sm:grid-cols-2"><h2 className="section-heading sm:col-span-2">Facturatie</h2>
        <label className="label flex flex-col gap-2">Factuurdatum<input name="issue_date" required type="date" defaultValue={todayValue} className="field" /></label>
        <label className="label flex flex-col gap-2">Leverings-/prestatiedatum<input name="delivery_date" required type="date" defaultValue={todayValue} className="field" /></label>
        <label className="label flex flex-col gap-2">Vervaldatum<input name="due_date" required type="date" defaultValue={dueValue} className="field" /></label>
        <label className="label flex flex-col gap-2 sm:col-span-2">Klant- of bestelreferentie (verplicht voor B2B)<input name="buyer_reference" placeholder="Bijvoorbeeld PO-2026-001" className="field" /></label>
        <label className="label flex items-center gap-3 sm:col-span-2"><input name="reverse_charge" type="checkbox" value="true" className="h-5 w-5" /> Binnenlandse verlegging van heffing (alleen B2B en na controle van de voorwaarden)</label>
        <label className="label flex items-center gap-3 sm:col-span-2"><input name="reduced_vat_confirmed" type="checkbox" value="true" className="h-5 w-5" /> Ik bevestig de actuele, versievaste verklaring voor 6% renovatie-btw (alleen B2C).</label>
      </section>
      <section className="card"><h2 className="section-heading">Lijnen</h2><div className="flex flex-col gap-2">{((lines ?? []) as QuoteLineItem[]).map((line) => <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-paper p-3"><span>{line.description}</span><span className="nums">{line.quantity} {line.unit} · € {(Number(line.unit_price_cents ?? 0) / 100).toFixed(2)} · {line.vat_rate === 0.06 ? '6%' : '21%'}</span><input type="hidden" name={`line_${line.id}_description`} value={line.description} /><input type="hidden" name={`line_${line.id}_quantity`} value={line.quantity} /><input type="hidden" name={`line_${line.id}_unit`} value={line.unit} /><input type="hidden" name={`line_${line.id}_unit_code`} value={normalizeUnitCode(line.unit, line.unit_code) ?? ''} /><input type="hidden" name={`line_${line.id}_unit_price_euros`} value={Number(line.unit_price_cents ?? 0) / 100} /><input type="hidden" name={`line_${line.id}_vat_rate`} value={line.vat_rate ?? 0.21} /><input type="hidden" name="source_line_id" value={line.id} /></div>)}</div></section>
      <button className="btn btn-primary" type="submit">Factuurconcept maken</button>
    </form>
  </main>;
}
