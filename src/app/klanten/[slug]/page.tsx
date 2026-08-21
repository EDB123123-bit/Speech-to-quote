import { notFound } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import QuotesList, { type QuoteListItem } from '@/components/QuotesList';
import { requireContractor } from '@/lib/auth/require-contractor';
import { findCustomerBySlug } from '@/lib/customers/derive';
import { loadCustomers } from '@/lib/customers/load';
import { formatEuros } from '@/lib/money/totals';

export const dynamic = 'force-dynamic';

export default async function CustomerDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase } = await requireContractor();
  const { customers } = await loadCustomers(supabase);
  const customer = findCustomerBySlug(customers, slug);
  if (!customer) notFound();

  const listItems: QuoteListItem[] = customer.quotes.map((quote) => ({
    id: quote.id,
    customerName: customer.name,
    place: placeFromAddress(customer.address),
    createdAt: quote.createdAt,
    issueDate: quote.issueDate,
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    totalCents: quote.totalCents,
    openQuestions: 0,
  }));

  return (
    <main className="page-shell">
      <Link href="/klanten" className="back-link"><Icon name="arrow-left" /> Terug naar klanten</Link>

      <header className="mb-7">
        <p className="eyebrow">Klant</p>
        <h1 className="page-title">{customer.name}</h1>
        <p className="page-subtitle">
          {customer.quoteCount} {customer.quoteCount === 1 ? 'offerte' : 'offertes'} · {formatEuros(customer.totalCents)} in totaal
        </p>
      </header>

      <section className="card mb-7">
        <h2 className="mb-3 text-lg font-extrabold">Gegevens</h2>
        <dl className="flex flex-col gap-3">
          <Detail label="Adres" value={customer.address} />
          <Detail label="E-mail" value={customer.email} href={customer.email ? `mailto:${customer.email}` : null} />
          <Detail label="Telefoon" value={customer.phone} href={customer.phone ? `tel:${customer.phone.replace(/\s/gu, '')}` : null} />
        </dl>
        <p className="mt-4 text-xs text-muted">
          Deze gegevens komen van de meest recente offerte waarop ze ingevuld staan.
        </p>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold">Offertes van deze klant</h2>
          <p className="text-sm text-muted">{customer.draftCount} in concept · {customer.finalCount} afgewerkt</p>
        </div>
        <QuotesList quotes={listItems} showSearch={false} />
      </section>
    </main>
  );
}

function Detail({ label, value, href }: { label: string; value: string | null; href?: string | null }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd>{value ? (href ? <a className="underline" href={href}>{value}</a> : value) : <span className="text-muted">Niet ingevuld</span>}</dd>
    </div>
  );
}

function placeFromAddress(address: string | null): string {
  if (!address) return '';
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? address;
}
