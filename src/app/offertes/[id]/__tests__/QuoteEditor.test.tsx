// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import QuoteEditor from '@/app/offertes/[id]/QuoteEditor';
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
  pdf_path: null, created_at: '2026-08-06T10:00:00Z',
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
    expect(screen.getByRole('button', { name: /offerte afwerken/i })).toBeDisabled();
  });

  it('enables finalizing when everything is complete', () => {
    render(<QuoteEditor quote={quote} initialLineItems={[line()]} initialClarifications={[]} />);
    expect(screen.getByRole('button', { name: /offerte afwerken/i })).toBeEnabled();
  });

  it('disables finalizing when a line item still lacks a VAT rate', () => {
    render(
      <QuoteEditor quote={quote} initialLineItems={[line({ vat_rate: null })]} initialClarifications={[]} />,
    );
    expect(screen.getByRole('button', { name: /offerte afwerken/i })).toBeDisabled();
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
});
