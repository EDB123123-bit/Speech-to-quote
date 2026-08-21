import { describe, expect, it } from 'vitest';
import {
  quoteImportBatchStatus,
  summarizeQuoteImportBatches,
  type QuoteImportBatchRow,
  type QuoteImportBatchSummary,
} from '../batch-list';

const batch = (id: string, overrides: Partial<QuoteImportBatchRow> = {}): QuoteImportBatchRow => ({
  id,
  created_at: '2026-08-21T15:38:01.994785+00',
  file_count: 1,
  processing_mode: 'interactive',
  ...overrides,
});

const summary = (overrides: Partial<QuoteImportBatchSummary> = {}): QuoteImportBatchSummary => ({
  id: 'batch-1',
  createdAt: '2026-08-21T15:38:01.994785+00',
  fileCount: 1,
  processingMode: 'interactive',
  imported: 0,
  review: 0,
  attention: 0,
  pending: 0,
  ...overrides,
});

describe('summarizeQuoteImportBatches', () => {
  it('groups every document status bucket per batch', () => {
    const [first, second] = summarizeQuoteImportBatches(
      [batch('batch-1', { file_count: 5 }), batch('batch-2')],
      [
        { batch_id: 'batch-1', status: 'imported' },
        { batch_id: 'batch-1', status: 'ready_for_review' },
        { batch_id: 'batch-1', status: 'failed' },
        { batch_id: 'batch-1', status: 'duplicate' },
        { batch_id: 'batch-1', status: 'processing' },
        { batch_id: 'batch-2', status: 'imported' },
      ],
    );

    expect(first).toMatchObject({ id: 'batch-1', fileCount: 5, imported: 1, review: 1, attention: 2, pending: 1 });
    expect(second).toMatchObject({ id: 'batch-2', imported: 1, review: 0, attention: 0, pending: 0 });
  });

  it('keeps a batch with no documents at zero rather than dropping it', () => {
    expect(summarizeQuoteImportBatches([batch('batch-1')], [])).toEqual([
      summary({ id: 'batch-1' }),
    ]);
  });

  it('ignores documents belonging to a batch outside the page', () => {
    const [only] = summarizeQuoteImportBatches(
      [batch('batch-1')],
      [{ batch_id: 'batch-other', status: 'ready_for_review' }],
    );
    expect(only.review).toBe(0);
  });

  it('preserves the order the batches were queried in', () => {
    const ordered = summarizeQuoteImportBatches([batch('b'), batch('a'), batch('c')], []);
    expect(ordered.map((item) => item.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('quoteImportBatchStatus', () => {
  it('ranks an outstanding review above running and failed work', () => {
    expect(quoteImportBatchStatus(summary({ review: 2, pending: 1, attention: 3 }))).toEqual({
      label: '2 na te kijken',
      tone: 'warning',
    });
  });

  it('reports running work before failures when nothing awaits review', () => {
    expect(quoteImportBatchStatus(summary({ pending: 1, attention: 2 }))).toEqual({
      label: 'Wordt verwerkt',
      tone: 'neutral',
    });
  });

  it('names the asynchronous provider batch while it runs', () => {
    expect(quoteImportBatchStatus(summary({ pending: 1, processingMode: 'provider_batch' })).label)
      .toBe('Batch wordt verwerkt');
  });

  it('falls back to failures, then to a finished batch', () => {
    expect(quoteImportBatchStatus(summary({ attention: 2 }))).toEqual({ label: '2 met aandacht', tone: 'critical' });
    expect(quoteImportBatchStatus(summary({ imported: 3 }))).toEqual({ label: 'Afgerond', tone: 'success' });
  });

  it('describes an empty batch instead of claiming it finished', () => {
    expect(quoteImportBatchStatus(summary())).toEqual({ label: 'Geen documenten', tone: 'neutral' });
  });
});
