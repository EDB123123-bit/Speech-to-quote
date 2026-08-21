import { notFound } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { requireContractor } from '@/lib/auth/require-contractor';
import { quoteImportEnabled } from '@/lib/quote-imports/constants';
import {
  summarizeQuoteImportBatches,
  type QuoteImportBatchRow,
  type QuoteImportDocumentCountRow,
} from '@/lib/quote-imports/batch-list';
import QuoteImportUploader from './QuoteImportUploader';
import ImportBatchList from './ImportBatchList';

export const dynamic = 'force-dynamic';

export default async function QuoteImportPage() {
  if (!quoteImportEnabled()) notFound();
  const { supabase } = await requireContractor();

  const { data: batchRows } = await supabase
    .from('quote_import_batches')
    .select('id, created_at, file_count, processing_mode')
    .order('created_at', { ascending: false })
    .limit(20);
  const batches = (batchRows ?? []) as QuoteImportBatchRow[];
  const { data: documentRows } = batches.length > 0
    ? await supabase
        .from('quote_import_documents')
        .select('batch_id, status')
        .in('batch_id', batches.map((batch) => batch.id))
    : { data: [] };
  const summaries = summarizeQuoteImportBatches(batches, (documentRows ?? []) as QuoteImportDocumentCountRow[]);

  return (
    <main className="page-shell">
      <Link href="/offertes" className="back-link"><Icon name="arrow-left" /> Terug naar offertes</Link>
      <header className="mb-7">
        <p className="eyebrow">Bulkimport</p>
        <h1 className="page-title">PDF-offertes importeren</h1>
        <p className="page-subtitle">Kies eerst hoeveel offertes je importeert. Vanaf 21 offertes gebruiken we een goedkopere batchimport die tot 24 uur kan duren.</p>
      </header>
      <QuoteImportUploader />

      <section className="mt-9">
        <h2 className="mb-4 text-lg font-extrabold">Eerdere imports</h2>
        <ImportBatchList batches={summaries} />
      </section>
    </main>
  );
}
