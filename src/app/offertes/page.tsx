import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Offertes</h1>
        <Link href="/offertes/nieuw" className="rounded bg-black px-4 py-2 text-white">
          Nieuwe offerte
        </Link>
      </div>

      {quotes.length === 0 ? (
        <p className="rounded border border-dashed p-6 text-center text-sm text-gray-600">
          Nog geen offertes. Maak je eerste offerte door de klus in te spreken.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {quotes.map((quote) => (
            <li key={quote.id}>
              <Link href={`/offertes/${quote.id}`} className="flex items-center justify-between rounded border p-4">
                <div>
                  <p className="font-medium">{quote.customer_name ?? 'Zonder klantnaam'}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(quote.created_at).toLocaleDateString('nl-BE')}
                  </p>
                </div>
                <span
                  className={`rounded px-2 py-1 text-xs ${
                    quote.status === 'final' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {quote.status === 'final' ? 'Afgewerkt' : 'Concept'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
