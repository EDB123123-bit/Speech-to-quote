import { requireContractor } from '@/lib/auth/require-contractor';
import RecordQuote from './RecordQuote';

export default async function NewQuotePage() {
  const { supabase } = await requireContractor();
  const { count } = await supabase
    .from('catalog_items')
    .select('id', { count: 'exact', head: true });

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="mb-2 text-3xl font-semibold">Nieuwe offerte</h1>
      <p className="mb-8 text-muted">
        Beschrijf de klus hardop: wat moet er gebeuren, met welke materialen en hoeveel.
      </p>
      <RecordQuote hasCatalogItems={(count ?? 0) > 0} />
    </main>
  );
}
