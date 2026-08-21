import type {
  QuoteImportBatch,
  QuoteImportDocumentStatus,
  QuoteImportProcessingMode,
} from '@/lib/supabase/types';

const ATTENTION_STATUSES: QuoteImportDocumentStatus[] = ['unsupported', 'failed', 'duplicate'];
const PENDING_STATUSES: QuoteImportDocumentStatus[] = ['uploaded', 'processing', 'importing'];

export type QuoteImportBatchRow = Pick<QuoteImportBatch, 'id' | 'created_at' | 'file_count' | 'processing_mode'>;
export type QuoteImportDocumentCountRow = { batch_id: string; status: QuoteImportDocumentStatus };

export type QuoteImportBatchSummary = {
  id: string;
  createdAt: string;
  fileCount: number;
  processingMode: QuoteImportProcessingMode;
  imported: number;
  review: number;
  attention: number;
  pending: number;
};

/** Groups document statuses per batch so the overview can be rendered without a per-batch query. */
export function summarizeQuoteImportBatches(
  batches: QuoteImportBatchRow[],
  documents: QuoteImportDocumentCountRow[],
): QuoteImportBatchSummary[] {
  const summaries = new Map<string, QuoteImportBatchSummary>(batches.map((batch) => [batch.id, {
    id: batch.id,
    createdAt: batch.created_at,
    fileCount: batch.file_count,
    processingMode: batch.processing_mode,
    imported: 0,
    review: 0,
    attention: 0,
    pending: 0,
  }]));

  for (const document of documents) {
    const summary = summaries.get(document.batch_id);
    if (!summary) continue;
    if (document.status === 'imported') summary.imported += 1;
    else if (document.status === 'ready_for_review') summary.review += 1;
    else if (ATTENTION_STATUSES.includes(document.status)) summary.attention += 1;
    else if (PENDING_STATUSES.includes(document.status)) summary.pending += 1;
  }

  return batches.map((batch) => summaries.get(batch.id)!);
}

/**
 * Picks the single most actionable headline per batch: an outstanding review always
 * outranks work that is still running, which in turn outranks documents that failed.
 */
export function quoteImportBatchStatus(summary: QuoteImportBatchSummary): {
  label: string;
  tone: 'warning' | 'neutral' | 'critical' | 'success';
} {
  if (summary.review > 0) {
    return { label: `${summary.review} na te kijken`, tone: 'warning' };
  }
  if (summary.pending > 0) {
    return {
      label: summary.processingMode === 'provider_batch' ? 'Batch wordt verwerkt' : 'Wordt verwerkt',
      tone: 'neutral',
    };
  }
  if (summary.attention > 0) {
    return { label: `${summary.attention} met aandacht`, tone: 'critical' };
  }
  if (summary.imported > 0) {
    return { label: 'Afgerond', tone: 'success' };
  }
  return { label: 'Geen documenten', tone: 'neutral' };
}
