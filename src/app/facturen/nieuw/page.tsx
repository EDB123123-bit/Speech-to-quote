import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireContractor } from '@/lib/auth/require-contractor';
import { createInvoiceDraft } from '../actions';
import { parseAddress } from '@/lib/invoices/constants';
import { formatEuros, summarizePricing } from '@/lib/money/totals';
import { quoteFamilyId } from '@/lib/invoices/quote-sources';
import type { InvoiceQuoteSource, Quote, QuoteLineItem } from '@/lib/supabase/types';

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ quote?: string }> }) {
  const { quote: requestedQuoteId } = await searchParams;
  if (!requestedQuoteId) notFound();
  const { supabase, contractor } = await requireContractor();
  const { data: requested } = await supabase.from('quotes').select('*').eq('id', requestedQuoteId).single();
  if (!requested) notFound();
  const requestedQuote = requested as Quote;
  const rootId = quoteFamilyId(requestedQuote);
  const [{ data: root }, { data: children }] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', rootId).single(),
    supabase.from('quotes').select('*').eq('parent_quote_id', rootId).order('created_at'),
  ]);
  const family = ([root, ...(children ?? [])] as Quote[]).filter((quote, index, all) => quote && all.findIndex((item) => item.id === quote.id) === index);
  if (!root || family.length === 0) notFound();
  const familyIds = family.map((quote) => quote.id);
  const [{ data: lines }, { data: sourceRows }] = await Promise.all([
    supabase.from('quote_line_items').select('*').in('quote_id', familyIds).order('sort_order'),
    supabase.from('invoice_quote_sources').select('*').in('quote_id', familyIds),
  ]);
  const typedLines = (lines ?? []) as QuoteLineItem[];
  const consumed = new Set(((sourceRows ?? []) as InvoiceQuoteSource[]).map((source) => source.quote_id));
  const available = family.filter((quote) => quote.status === 'accepted' && quote.contractor_id === contractor.id && !consumed.has(quote.id));
  const firstQuote = requestedQuote.status === 'accepted' ? requestedQuote : available.find((quote) => !consumed.has(quote.id)) ?? available[0] ?? requestedQuote;
  const address = parseAddress(firstQuote.customer_address ?? '');
  const linesByQuote = new Map<string, QuoteLineItem[]>();
  for (const line of typedLines) linesByQuote.set(line.quote_id, [...(linesByQuote.get(line.quote_id) ?? []), line]);
  const today = new Date();
  const todayValue = today.toISOString().slice(0, 10);
  const dueValue = new Date(today.getTime() + (contractor.default_payment_term_days ?? 30) * 86400000).toISOString().slice(0, 10);
  return <main className="page-shell page-medium">
    <Link href={`/offertes/${requestedQuoteId}`} className="back-link">← Terug naar offerte</Link>
    <header className="page-header"><div><p className="eyebrow">Nieuwe factuur</p><h1 className="page-title">Factuurbronnen kiezen</h1><p className="page-subtitle">Selecteer expliciet welke aanvaarde offertes samen op deze factuur komen.</p></div></header>
    <form action={createInvoiceDraft} className="flex flex-col gap-5">
      <section className="card"><h2 className="section-heading">Aanvaarde offertes</h2><div className="flex flex-col gap-3">
        {family.map((quote) => {
          const pricing = summarizePricing(linesByQuote.get(quote.id) ?? []);
          const isAvailable = available.some((item) => item.id === quote.id);
          const isPreselected = quote.id === requestedQuoteId && isAvailable;
          return <label key={quote.id} className={`flex cursor-pointer flex-col gap-2 rounded-xl border-2 p-4 ${isAvailable ? 'border-line bg-paper' : 'border-line-muted bg-paper/50 opacity-70'}`}>
            <span className="flex items-start justify-between gap-3"><span className="flex items-center gap-3"><input type="checkbox" name="quote_id" value={quote.id} defaultChecked={isPreselected} disabled={!isAvailable} className="h-5 w-5" /><span><strong>{quote.quote_number ?? quote.id.slice(0, 8)}</strong><span className="ml-2 text-sm text-muted">{quote.quote_kind === 'meerwerk' ? 'Meerwerkofferte' : 'Standaardofferte'}</span></span></span><span className="badge badge-success">{quote.status === 'accepted' ? 'Aanvaard' : quote.status === 'draft' ? 'Concept' : quote.status}</span></span>
            <span className="text-sm text-muted">{quote.customer_name ?? 'Klant onbekend'} · Bekend bedrag {formatEuros(pricing.knownTotalCents)}{pricing.unknownLineCount > 0 ? ` · ${pricing.unknownLineCount} lijn${pricing.unknownLineCount === 1 ? '' : 'en'} zonder volledig bedrag` : ''}</span>
            {consumed.has(quote.id) && <span className="text-sm font-bold text-warning-ink">Al aan een factuur gekoppeld</span>}
          </label>;
        })}
        {available.length === 0 && <p className="alert alert-warning">Er zijn geen ongebruikte aanvaarde offertes in deze familie.</p>}
        <p className="section-copy">Lijnen zonder expliciete prijs, geldige btw, aantal of eenheid worden niet automatisch als €0 gefactureerd.</p>
      </div></section>
      <section className="card grid gap-4 sm:grid-cols-2"><h2 className="section-heading sm:col-span-2">Klant</h2>
        <label className="label flex flex-col gap-2 sm:col-span-2">Type klant<select name="customer_type" defaultValue="private" className="field"><option value="private">Particulier (B2C)</option><option value="business">Onderneming (B2B / Peppol)</option></select></label>
        <label className="label flex flex-col gap-2 sm:col-span-2">Naam<input name="customer_name" required defaultValue={firstQuote.customer_name ?? ''} className="field" /></label>
        <label className="label flex flex-col gap-2 sm:col-span-2">Adres (voor PDF)<input name="customer_address" required defaultValue={firstQuote.customer_address ?? ''} className="field" /></label>
        <label className="label flex flex-col gap-2">Straat en nummer<input name="customer_street" required defaultValue={address.street} className="field" /></label>
        <label className="label flex flex-col gap-2">Postcode<input name="customer_postal_code" required defaultValue={address.postalCode} className="field" /></label>
        <label className="label flex flex-col gap-2">Gemeente<input name="customer_city" required defaultValue={address.city} className="field" /></label>
        <label className="label flex flex-col gap-2">Landcode<input name="customer_country_code" required defaultValue="BE" maxLength={2} className="field" /></label>
        <label className="label flex flex-col gap-2">E-mail<input name="customer_email" type="email" defaultValue={firstQuote.customer_email ?? ''} className="field" /></label>
        <label className="label flex flex-col gap-2">Telefoon<input name="customer_phone" defaultValue={firstQuote.customer_phone ?? ''} className="field" /></label>
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
      <button className="btn btn-primary" type="submit" disabled={available.length === 0}>Factuurconcept maken</button>
    </form>
  </main>;
}
