// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ImportBatchList from '../ImportBatchList';
import type { QuoteImportBatchSummary } from '@/lib/quote-imports/batch-list';

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

describe('ImportBatchList', () => {
  it('explains the empty state instead of rendering a bare list', () => {
    render(<ImportBatchList batches={[]} />);
    expect(screen.getByText('Nog geen imports')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('links each batch to its review page', () => {
    render(<ImportBatchList batches={[summary({ id: 'abc-123', review: 1 })]} />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/offertes/importeren/abc-123');
  });

  it('surfaces an outstanding review as the batch headline', () => {
    render(<ImportBatchList batches={[summary({ review: 2, fileCount: 3 })]} />);
    expect(screen.getByText('2 na te kijken')).toBeInTheDocument();
    expect(screen.getByText('3 offertes')).toBeInTheDocument();
  });

  it('uses the singular file label for a one-document batch', () => {
    render(<ImportBatchList batches={[summary({ fileCount: 1, imported: 1 })]} />);
    expect(screen.getByText('1 offerte')).toBeInTheDocument();
    expect(screen.getByText('Afgerond')).toBeInTheDocument();
  });

  it('renders every batch it is given', () => {
    render(<ImportBatchList batches={[
      summary({ id: 'a', imported: 1 }),
      summary({ id: 'b', review: 1 }),
      summary({ id: 'c', attention: 1 }),
    ]} />);
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getByText('1 met aandacht')).toBeInTheDocument();
  });
});
