import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import DeleteQuoteButton from '@/components/DeleteQuoteButton';
import type { Quote } from '@/lib/supabase/types';

export default async function QuotesPage() {
  const { supabase } = await requireContractor();
  const { data } = await supabase
    .from('quotes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);

  const quotes = (data ?? []) as Quote[];

  return (
    <main className="mx-auto max-w-2xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Offertes</h1>
        <Link href="/offertes/nieuw" className="btn btn-accent">
          Nieuwe offerte
        </Link>
      </div>

      {quotes.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Nog geen offertes. Maak je eerste offerte door de klus in te spreken.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <div className="card flex items-center justify-between gap-3">
                <Link
                  href={`/offertes/${quote.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between transition-colors hover:text-accent"
                >
                  <div>
                    <p className="font-medium">{quote.customer_name ?? 'Zonder klantnaam'}</p>
                    <p className="nums text-sm text-muted">
                      {new Date(quote.created_at).toLocaleDateString('nl-BE')}
                    </p>
                  </div>
                  <span className={`badge ${quote.status === 'final' ? 'badge-success' : 'badge-neutral'}`}>
                    {quote.status === 'final' ? 'Afgewerkt' : 'Concept'}
                  </span>
                </Link>
                <DeleteQuoteButton quoteId={quote.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
