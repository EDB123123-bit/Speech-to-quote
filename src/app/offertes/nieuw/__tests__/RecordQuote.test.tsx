// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecordQuote from '@/app/offertes/nieuw/RecordQuote';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

// Drive the upload directly by invoking the recorder's callback.
vi.mock('@/components/VoiceRecorder', () => ({
  default: ({ onRecorded, disabled }: { onRecorded: (b: Blob) => void; disabled?: boolean }) => (
    <button disabled={disabled} onClick={() => onRecorded(new Blob(['audio']))}>
      Opnemen
    </button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('RecordQuote', () => {
  it('allows recording without a catalogue', () => {
    render(<RecordQuote hasCatalogItems={false} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /opnemen/i })).toBeEnabled();
  });

  it('navigates to the new quote after a successful upload', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ quoteId: 'quote-9' }),
    });

    render(<RecordQuote hasCatalogItems />);
    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/offertes/quote-9'));
  });

  it('includes the accepted parent when recording a voice change order', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ quoteId: 'change-order-1' }),
    });

    render(<RecordQuote parentQuoteId="parent-1" />);
    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));

    await waitFor(() => {
      const body = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as FormData;
      expect(body.get('parentQuoteId')).toBe('parent-1');
      expect(push).toHaveBeenCalledWith('/offertes/change-order-1');
    });
  });

  it('shows the server error message when the upload fails', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Transcriptie mislukt' }),
    });

    render(<RecordQuote hasCatalogItems />);
    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Transcriptie mislukt'));
  });

  it('offers a retry that reuses the recording instead of forcing a new one', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Transcriptie mislukt' }),
    });

    render(<RecordQuote hasCatalogItems />);
    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /opnieuw proberen/i })).toBeInTheDocument());

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ quoteId: 'quote-10' }),
    });
    await userEvent.click(screen.getByRole('button', { name: /opnieuw proberen/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/offertes/quote-10'));
  });

  it('still navigates to the draft when extraction failed but a quote id came back', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Automatische verwerking mislukt', quoteId: 'quote-11' }),
    });

    render(<RecordQuote hasCatalogItems />);
    await userEvent.click(screen.getByRole('button', { name: /opnemen/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/offertes/quote-11'));
  });
});
