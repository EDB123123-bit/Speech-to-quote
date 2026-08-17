// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailQuoteForm from '@/components/EmailQuoteForm';
import type { MailboxSummary, Quote } from '@/lib/supabase/types';

const quote: Quote = {
  id: '12345678-abcd-1234-abcd-123456789012',
  contractor_id: 'contractor-1',
  transcript: null,
  status: 'final',
  customer_name: 'Jan Peeters',
  customer_address: 'Dorpsstraat 5',
  customer_email: 'jan@example.com',
  customer_phone: null,
  audio_path: null,
  audio_deleted_at: null,
  pdf_path: 'contractor-1/quote.pdf',
  created_at: '2026-08-16T12:00:00Z',
};

const mailbox: MailboxSummary = {
  provider: 'gmail',
  email_address: 'dakwerker@example.com',
  status: 'connected',
  connected_at: '2026-08-16T12:00:00Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('EmailQuoteForm', () => {
  it('points to settings when no mailbox is connected', () => {
    render(<EmailQuoteForm quote={quote} companyName="Dakwerken Peeters" mailbox={null} />);

    expect(screen.getByRole('link', { name: /mailbox verbinden/i })).toHaveAttribute(
      'href',
      '/instellingen',
    );
  });

  it('prefills the customer and sends the quote from the connected mailbox', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, from: mailbox.email_address }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<EmailQuoteForm quote={quote} companyName="Dakwerken Peeters" mailbox={mailbox} />);

    expect(screen.getByLabelText(/aan/i)).toHaveValue('jan@example.com');
    expect(screen.getByLabelText(/onderwerp/i)).toHaveValue('Offerte van Dakwerken Peeters');
    expect((screen.getByLabelText(/bericht/i) as HTMLTextAreaElement).value).toContain(
      'Beste Jan Peeters',
    );

    await userEvent.click(screen.getByRole('button', { name: /offerte versturen/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/quotes/${quote.id}/send`,
      expect.objectContaining({ method: 'POST' }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Offerte verstuurd naar jan@example.com vanuit dakwerker@example.com.',
    );
  });

  it('shows the provider error returned by the server', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Gmail kon de offerte niet versturen.' }),
    }));

    render(<EmailQuoteForm quote={quote} companyName="Dakwerken Peeters" mailbox={mailbox} />);
    await userEvent.click(screen.getByRole('button', { name: /offerte versturen/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Gmail kon de offerte niet versturen.',
    );
  });
});
