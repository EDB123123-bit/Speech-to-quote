import { notFound } from 'next/navigation';
import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { requireContractor } from '@/lib/auth/require-contractor';
import { quoteImportEnabled } from '@/lib/quote-imports/constants';
import QuoteImportUploader from './QuoteImportUploader';

export const dynamic = 'force-dynamic';

export default async function QuoteImportPage() {
  if (!quoteImportEnabled()) notFound();
  await requireContractor();

  return (
    <main className="page-shell">
      <Link href="/offertes" className="back-link"><Icon name="arrow-left" /> Terug naar offertes</Link>
      <header className="mb-7">
        <p className="eyebrow">Bulkimport</p>
        <h1 className="page-title">PDF-offertes importeren</h1>
        <p className="page-subtitle">Kies eerst hoeveel offertes je importeert. Vanaf 21 offertes gebruiken we een goedkopere batchimport die tot 24 uur kan duren.</p>
      </header>
      <QuoteImportUploader />
    </main>
  );
}
