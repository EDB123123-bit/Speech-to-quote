import { notFound } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { requireContractor } from '@/lib/auth/require-contractor';
import { quoteImportEnabled } from '@/lib/quote-imports/constants';
import type { QuoteImportBatch, QuoteImportDocument } from '@/lib/supabase/types';
import ImportBatchDashboard from './ImportBatchDashboard';

export default async function ImportBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  if (!quoteImportEnabled()) notFound();
  const { batchId } = await params;
  const { supabase } = await requireContractor();
  const [{ data: batch }, { data: documents }] = await Promise.all([
    supabase.from('quote_import_batches').select('*').eq('id', batchId).maybeSingle(),
    supabase.from('quote_import_documents').select('*').eq('batch_id', batchId).order('created_at'),
  ]);
  if (!batch) notFound();
  return <main className="page-shell">
    <Link href="/offertes" className="back-link"><Icon name="arrow-left" /> Terug naar offertes</Link>
    <header className="mb-7"><p className="eyebrow">PDF-import</p><h1 className="page-title">Offertes nakijken</h1><p className="page-subtitle">Controleer elk document. Niets wordt automatisch afgewerkt of verstuurd.</p></header>
    <ImportBatchDashboard batch={batch as QuoteImportBatch} documents={(documents ?? []) as QuoteImportDocument[]} />
  </main>;
}
