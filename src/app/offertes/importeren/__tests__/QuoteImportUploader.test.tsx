// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuoteImportUploader from '../QuoteImportUploader';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('../actions', () => ({
  createQuoteImportBatch: vi.fn(),
  discardUnregisteredUpload: vi.fn(),
  registerUploadedQuote: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());

describe('QuoteImportUploader', () => {
  it('asks for a quote count before enabling file selection', () => {
    render(<QuoteImportUploader />);
    expect(screen.getByLabelText(/hoeveel offertes/i)).toHaveValue(null);
    expect(screen.getByRole('button', { name: /vul eerst het aantal in/i })).toBeDisabled();
  });

  it('keeps twenty quotes in the fast model-cascade flow', async () => {
    render(<QuoteImportUploader />);
    await userEvent.type(screen.getByLabelText(/hoeveel offertes/i), '20');
    expect(screen.getByText('Snelle import')).toBeInTheDocument();
    expect(screen.getByText(/alleen bij twijfel opnieuw gecontroleerd/i)).toBeInTheDocument();
    expect(screen.queryByText(/tot 24 uur/i)).not.toBeInTheDocument();
  });

  it('shows the 24-hour batch warning from twenty-one quotes onward', async () => {
    render(<QuoteImportUploader />);
    await userEvent.type(screen.getByLabelText(/hoeveel offertes/i), '21');
    expect(screen.getByText('Batchimport')).toBeInTheDocument();
    expect(screen.getByText(/tot 24 uur duren/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Kies 21 PDF-offertes' })).toBeEnabled();
  });

  it('does not accept a count above the twenty-five document limit', async () => {
    render(<QuoteImportUploader />);
    await userEvent.type(screen.getByLabelText(/hoeveel offertes/i), '26');
    expect(screen.getByRole('button', { name: /vul eerst het aantal in/i })).toBeDisabled();
  });
});
