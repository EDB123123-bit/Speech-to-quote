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
  it('tells the contractor to set up a price list first when the catalog is empty', () => {
    render(<RecordQuote hasCatalogItems={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/prijslijst/i);
    expect(screen.getByRole('button', { name: /opnemen/i })).toBeDisabled();
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
