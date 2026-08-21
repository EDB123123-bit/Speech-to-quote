// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportBatchDashboard from '../[batchId]/ImportBatchDashboard';
import { approveQuoteImport } from '../actions';
import type { QuoteImportBatch, QuoteImportDocument } from '@/lib/supabase/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('../actions', () => ({
  approveQuoteImport: vi.fn(),
  reviewProfileSuggestion: vi.fn(),
}));

const batch = {
  id: 'batch-1',
  contractor_id: 'contractor-1',
  requested_quote_count: 1,
  processing_mode: 'interactive',
  status: 'active',
  file_count: 1,
  total_bytes: 1000,
  profile_suggestion: null,
  profile_suggestion_status: 'unavailable',
  completed_at: null,
  created_at: '2026-08-21T15:38:00Z',
  updated_at: '2026-08-21T15:38:00Z',
} as QuoteImportBatch;

const line = (description: string, unit = '') => ({
  description, notes: null, quantity: 1, unit, unitCode: null,
  unitPriceCents: 7500, vatRate: 0.06, vatCategory: 'S', lineType: 'combined',
});

/** A document whose lines all carry a unit, so nothing blocks approval. */
const readyDocument = () => document({
  reviewed_payload: {
    customer: { name: 'anne bauwens', address: null, email: null, phone: null },
    quote: { number: 'O260194', issueDate: '2026-07-27', validUntil: '2026-08-26', orderReference: null },
    lines: [line('Plaatsen kraan', 'stuk'), line('Vervangen leiding', 'm')],
    sourceTotals: { subtotalCents: 15000, vatTotalCents: 900, totalCents: 15900 },
    inferredPaths: [],
  },
  validation_result: { issues: [] },
} as unknown as Partial<QuoteImportDocument>);

const document = (overrides: Partial<QuoteImportDocument> = {}) => ({
  id: 'doc-1',
  batch_id: 'batch-1',
  original_filename: 'Offerte_O260194.pdf',
  status: 'ready_for_review',
  page_count: 1,
  quote_id: null,
  error_message: null,
  provider_batch_status: null,
  locked_until: null,
  reviewed_payload: {
    customer: { name: 'anne bauwens', address: null, email: null, phone: null },
    quote: { number: 'O260194', issueDate: '2026-07-27', validUntil: '2026-08-26', orderReference: null },
    lines: [line('Plaatsen kraan'), line('Vervangen leiding')],
    sourceTotals: { subtotalCents: 15000, vatTotalCents: 900, totalCents: 15900 },
    inferredPaths: ['lines.0.unit'],
  },
  validation_result: {
    issues: [
      { code: 'line_unit', severity: 'warning', messageNl: 'Bevestig de eenheid van deze offertelijn.', path: 'lines.0.unit' },
      { code: 'inferred', severity: 'warning', messageNl: 'Controleer dit afgeleide veld.', path: 'lines.0.unit' },
      { code: 'line_unit', severity: 'warning', messageNl: 'Bevestig de eenheid van deze offertelijn.', path: 'lines.1.unit' },
      { code: 'seller_vat', severity: 'warning', messageNl: 'Controleer het btw-nummer van de afzender.', path: 'seller.vatNumber' },
    ],
  },
  ...overrides,
}) as unknown as QuoteImportDocument;

function lineCard(index: number): HTMLElement {
  return screen.getByText(`Lijn ${index + 1}`).closest('div')!.parentElement as HTMLElement;
}

describe('ImportBatchDashboard review card', () => {
  it('anchors each warning to the line it concerns instead of one flat list', () => {
    render(<ImportBatchDashboard batch={batch} documents={[document()]} />);

    const first = lineCard(0);
    expect(within(first).getByText(/Bevestig de eenheid/)).toBeInTheDocument();
    expect(within(first).getByText(/Controleer dit afgeleide veld/)).toBeInTheDocument();
    expect(within(first).getByText('2 opmerkingen')).toBeInTheDocument();

    const second = lineCard(1);
    expect(within(second).getByText(/Bevestig de eenheid/)).toBeInTheDocument();
    expect(within(second).getByText('1 opmerking')).toBeInTheDocument();
  });

  it('names the field each line warning belongs to', () => {
    render(<ImportBatchDashboard batch={batch} documents={[document()]} />);
    expect(within(lineCard(0)).getAllByText('Eenheid:').length).toBeGreaterThan(0);
  });

  it('keeps document-level warnings in the banner and summarises the line count', () => {
    render(<ImportBatchDashboard batch={batch} documents={[document()]} />);
    expect(screen.getByText('Controleer het btw-nummer van de afzender.')).toBeInTheDocument();
    expect(screen.getByText(/2 offertelijnen vragen aandacht/)).toBeInTheDocument();
  });

  it('lists the inferred fields for the affected line', () => {
    render(<ImportBatchDashboard batch={batch} documents={[document()]} />);
    expect(within(lineCard(0)).getByText('Afgeleide velden: Eenheid')).toBeInTheDocument();
  });

  it('blocks approval while a line has no unit and names the lines', () => {
    render(<ImportBatchDashboard batch={batch} documents={[document()]} />);
    expect(screen.getByText('Vul de eenheid in bij lijn 1 en 2 voor je importeert.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Als bewerkbaar concept importeren' })).toBeDisabled();
    expect(within(lineCard(0)).getByText(/Eenheid is verplicht/)).toBeInTheDocument();
  });

  it('allows approval once every line carries a unit', () => {
    render(<ImportBatchDashboard batch={batch} documents={[readyDocument()]} />);
    expect(screen.queryByText(/Vul de eenheid in/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Als bewerkbaar concept importeren' })).toBeEnabled();
  });

  it('shows a returned server failure instead of an opaque error', async () => {
    vi.mocked(approveQuoteImport).mockResolvedValue({
      ok: false, error: 'Dit offertenummer bestaat al. Kies een nieuwe identiteit.',
    });
    render(<ImportBatchDashboard batch={batch} documents={[readyDocument()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Als bewerkbaar concept importeren' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Dit offertenummer bestaat al.');
  });

  it('reports a thrown failure in plain language rather than a React error code', async () => {
    vi.mocked(approveQuoteImport).mockRejectedValue(new Error('Minified React error #441;'));
    render(<ImportBatchDashboard batch={batch} documents={[readyDocument()]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Als bewerkbaar concept importeren' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Importeren mislukt. Probeer opnieuw.');
    expect(alert).not.toHaveTextContent('441');
  });

  it('offers a full-width view and a new tab for the cramped source pane', async () => {
    render(<ImportBatchDashboard batch={batch} documents={[document()]} />);
    expect(screen.getByRole('link', { name: 'Openen in nieuw tabblad' }))
      .toHaveAttribute('href', '/api/quote-imports/doc-1/source');

    const toggle = screen.getByRole('button', { name: 'Bron groter tonen' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Naast het formulier tonen' })).toHaveAttribute('aria-pressed', 'true');
  });
});
