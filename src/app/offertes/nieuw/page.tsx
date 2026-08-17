import { requireContractor } from '@/lib/auth/require-contractor';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import RecordQuote from './RecordQuote';

export default async function NewQuotePage() {
  const { supabase } = await requireContractor();
  const { count } = await supabase
    .from('catalog_items')
    .select('id', { count: 'exact', head: true });

  return (
    <main className="page-shell page-narrow">
      <Link href="/offertes" className="back-link"><Icon name="arrow-left" /> Terug naar offertes</Link>
      <div className="record-intro">
        <p className="eyebrow">Nieuwe offerte</p>
        <h1 className="page-title">Vertel wat er moet gebeuren.</h1>
        <p className="page-subtitle">
          Noem de werken, aantallen en materialen. Spreek zoals je het aan een collega zou uitleggen.
        </p>
      </div>
      <RecordQuote hasCatalogItems={(count ?? 0) > 0} />
    </main>
  );
}
