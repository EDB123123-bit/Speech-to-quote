import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import { loadCustomers } from '@/lib/customers/load';
import CustomersList from '@/components/CustomersList';

export const dynamic = 'force-dynamic';

export default async function CustomersPage() {
  const { supabase } = await requireContractor();
  const { customers, quotesWithoutCustomer } = await loadCustomers(supabase);

  const totalQuotes = customers.reduce((sum, customer) => sum + customer.quoteCount, 0);

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Klantenbestand</p>
          <h1 className="page-title">Klanten</h1>
          <p className="page-subtitle">
            {customers.length} {customers.length === 1 ? 'klant' : 'klanten'} · {totalQuotes} {totalQuotes === 1 ? 'offerte' : 'offertes'}
          </p>
        </div>
      </header>

      {customers.length === 0 ? (
        <div className="empty-state">
          <strong>Nog geen klanten</strong>
          Klanten verschijnen hier zodra je een offerte met een klantnaam maakt.
        </div>
      ) : (
        <CustomersList customers={customers} />
      )}

      {quotesWithoutCustomer > 0 && (
        <p className="mt-5 text-sm text-muted">
          {quotesWithoutCustomer} {quotesWithoutCustomer === 1 ? 'offerte heeft' : 'offertes hebben'} nog geen klantnaam en {quotesWithoutCustomer === 1 ? 'staat' : 'staan'} hier niet bij.{' '}
          <Link href="/offertes" className="underline">Bekijk alle offertes</Link>
        </p>
      )}
    </main>
  );
}
