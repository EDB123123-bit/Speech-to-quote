import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import { quoteImportBatchStatus, type QuoteImportBatchSummary } from '@/lib/quote-imports/batch-list';

export default function ImportBatchList({ batches }: { batches: QuoteImportBatchSummary[] }) {
  if (batches.length === 0) {
    return <div className="empty-state">
      <strong>Nog geen imports</strong>
      Zodra je pdf&apos;s uploadt, vind je elke import hier terug.
    </div>;
  }

  return <ul className="quote-list">
    {batches.map((batch) => {
      const status = quoteImportBatchStatus(batch);
      return <li key={batch.id} className="quote-card">
        <Link href={`/offertes/importeren/${batch.id}`} className="quote-card-link">
          <div>
            <p className="quote-name">{batch.fileCount} {batch.fileCount === 1 ? 'offerte' : 'offertes'}</p>
            <p className="quote-meta">{formatBatchDate(batch.createdAt)}</p>
          </div>
          <span className={`status-pill is-${status.tone}`}>
            {status.tone === 'warning' && <Icon name="warning" size={15} />}
            {status.label}
          </span>
          <Icon name="chevron-right" size={20} />
        </Link>
      </li>;
    })}
  </ul>;
}

function formatBatchDate(createdAt: string): string {
  return new Date(createdAt).toLocaleString('nl-BE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
