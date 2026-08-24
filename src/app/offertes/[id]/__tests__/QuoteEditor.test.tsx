// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuoteEditor from '@/app/offertes/[id]/QuoteEditor';
import { updateLineItem, addLineItem } from '@/app/offertes/[id]/line-item-actions';
import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/components/ClarificationPanel', () => ({
  default: ({ clarifications }: { clarifications: QuoteClarification[] }) => (
    <div data-testid="clarifications">{clarifications.length}</div>
  ),
}));
vi.mock('@/components/CustomerForm', () => ({ default: () => <div data-testid="customer-form" /> }));
vi.mock('@/app/offertes/[id]/line-item-actions', () => ({
  updateLineItem: vi.fn().mockResolvedValue(undefined),
  addLineItem: vi.fn().mockResolvedValue(undefined),
  removeLineItem: vi.fn().mockResolvedValue(undefined),
}));

const quote: Quote = {
  id: 'quote-1', contractor_id: 'c1', transcript: 'tachtig vierkante meter dakpannen',
  status: 'draft', customer_name: 'Jan Peeters', customer_address: 'Dorpsstraat 5',
  customer_email: null, customer_phone: null, audio_path: null, audio_deleted_at: null,
  pdf_path: null, pipeline_stage_id: null, created_at: '2026-08-06T10:00:00Z',
};

function line(overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'line-1', quote_id: 'quote-1', catalog_item_id: 'cat-1',
    description: 'Dakpannen leggen – materiaal', quantity: 80, unit: 'm²',
    unit_price_cents: 3000, vat_rate: 0.06, line_type: 'materials',
    sort_order: 0, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('QuoteEditor', () => {
  it('shows the transcript so the contractor can see what was heard', () => {
    render(<QuoteEditor quote={quote} initialLineItems={[line()]} initialClarifications={[]} />);
    expect(screen.getByText(/tachtig vierkante meter dakpannen/)).toBeInTheDocument();
  });

  it('does not show the voice transcript for a Gmail import', () => {
    render(<QuoteEditor quote={{ ...quote, source: 'gmail' }} initialLineItems={[line()]} initialClarifications={[]} />);
    expect(screen.queryByText(/tachtig vierkante meter dakpannen/)).not.toBeInTheDocument();
  });

  it('does not show the voice transcript when Gmail provenance is supplied separately', () => {
    render(<QuoteEditor quote={quote} isGmailImport initialLineItems={[line()]} initialClarifications={[]} />);
    expect(screen.queryByText(/tachtig vierkante meter dakpannen/)).not.toBeInTheDocument();
  });

  it('does not show voice clarification or retry UI for a Gmail quote', () => {
    render(<QuoteEditor quote={{ ...quote, transcript: 'mailinhoud' }} isGmailImport initialLineItems={[]} initialClarifications={[{
      id: 'c1', quote_id: 'quote-1', question_nl: 'Welke prijs moet ik invullen?',
      status: 'pending', retry_count: 0, created_at: '2026-08-06T00:00:00Z',
    }]} />);
    expect(screen.queryByTestId('clarifications')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /prijslijst opnieuw toepassen/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /e-mail opnieuw verwerken/i })).toBeInTheDocument();
  });

  it('renders the line items editor', () => {
    render(<QuoteEditor quote={quote} initialLineItems={[line()]} initialClarifications={[]} />);
    expect(screen.getByDisplayValue('Dakpannen leggen – materiaal')).toBeInTheDocument();
  });

  it('disables finalizing while a clarification is pending', () => {
    render(
      <QuoteEditor
        quote={quote}
        initialLineItems={[line()]}
        initialClarifications={[{
          id: 'c1', quote_id: 'quote-1', question_nl: 'Welk type?',
          status: 'pending', retry_count: 0, created_at: '2026-08-06T00:00:00Z',
        }]}
      />,
    );
    const button = screen.getByRole('button', { name: /offerte afwerken/i });
    expect(button).toBeDisabled();
    expect(button.parentElement).toHaveAttribute('title', expect.stringContaining('openstaande vraag'));
  });

  it('enables finalizing when everything is complete', () => {
    render(<QuoteEditor quote={quote} initialLineItems={[line()]} initialClarifications={[]} />);
    expect(screen.getByRole('button', { name: /offerte afwerken/i })).toBeEnabled();
  });

  it('disables finalizing when a line item still lacks a VAT rate', () => {
    render(
      <QuoteEditor quote={quote} initialLineItems={[line({ vat_rate: null })]} initialClarifications={[]} />,
    );
    const button = screen.getByRole('button', { name: /offerte afwerken/i });
    expect(button).toBeDisabled();
    expect(button.parentElement).toHaveAttribute('title', expect.stringContaining('btw'));
  });

  it('shows the server blockers when finalizing is rejected', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ blockers: [{ code: 'missing_customer', messageNl: 'Vul de klantgegevens in.' }] }),
    });

    render(<QuoteEditor quote={quote} initialLineItems={[line()]} initialClarifications={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /offerte afwerken/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Vul de klantgegevens in.'));
  });

  it('shows a download link once the quote is final', () => {
    render(
      <QuoteEditor quote={{ ...quote, status: 'final' }} initialLineItems={[line()]} initialClarifications={[]} />,
    );
    expect(screen.getByRole('link', { name: /pdf downloaden/i })).toHaveAttribute(
      'href',
      '/api/quotes/quote-1/pdf',
    );
  });

  it('makes line items read-only once the quote is final', () => {
    render(
      <QuoteEditor quote={{ ...quote, status: 'final' }} initialLineItems={[line()]} initialClarifications={[]} />,
    );
    expect(screen.getByDisplayValue('Dakpannen leggen – materiaal')).toBeDisabled();
  });

  it('shows a save-failure alert and blocks finalizing when a line item edit fails to persist', async () => {
    (updateLineItem as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));

    render(<QuoteEditor quote={quote} initialLineItems={[line()]} initialClarifications={[]} />);

    fireEvent.change(screen.getByDisplayValue('Dakpannen leggen – materiaal'), {
      target: { value: 'Dakpannen leggen – materiaal (herzien)' },
    });

    await waitFor(() =>
      expect(screen.getByText(/kon niet opgeslagen worden/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /offerte afwerken/i })).toBeDisabled();
  });

  it('shows a save-failure alert when adding a line item fails to persist', async () => {
    (addLineItem as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));

    render(<QuoteEditor quote={quote} initialLineItems={[line()]} initialClarifications={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /materiaal toevoegen/i }));

    await waitFor(() =>
      expect(screen.getByText(/kon niet opgeslagen worden/i)).toBeInTheDocument(),
    );
  });

  it('shows the new line item after adding it succeeds', async () => {
    (addLineItem as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      line({ id: 'line-2', description: 'Nieuw item – materiaal', unit_price_cents: null, vat_rate: null }),
    );

    render(<QuoteEditor quote={quote} initialLineItems={[]} initialClarifications={[]} />);
    await userEvent.click(screen.getByRole('button', { name: /materiaal toevoegen/i }));

    await waitFor(() =>
      expect(screen.getByDisplayValue('Nieuw item – materiaal')).toBeInTheDocument(),
    );
  });

  it('offers to reprocess the recording without referring to a catalogue', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, lineItemCount: 2 }),
    });

    render(<QuoteEditor quote={quote} initialLineItems={[]} initialClarifications={[]} />);
    expect(screen.queryByText(/prijslijst/iu)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /opname opnieuw verwerken/i }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/quotes/quote-1/retry', { method: 'POST' }));
  });
});
