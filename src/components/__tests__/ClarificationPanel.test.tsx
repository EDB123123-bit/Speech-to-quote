// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClarificationPanel from '@/components/ClarificationPanel';
import type { QuoteClarification } from '@/lib/supabase/types';

vi.mock('@/components/VoiceRecorder', () => ({
  default: ({ onRecorded }: { onRecorded: (b: Blob) => void }) => (
    <button onClick={() => onRecorded(new Blob(['antwoord']))}>Antwoord opnemen</button>
  ),
}));

const dismissClarification = vi.fn();
vi.mock('@/app/offertes/[id]/clarification-actions', () => ({
  dismissClarification: (id: string) => dismissClarification(id),
}));

function clarification(overrides: Partial<QuoteClarification> = {}): QuoteClarification {
  return {
    id: 'clar-1',
    quote_id: 'quote-1',
    question_nl: 'Welk type dakpannen wil je gebruiken?',
    status: 'pending',
    retry_count: 0,
    created_at: '2026-08-06T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
  // Audio playback is unavailable in jsdom; make it a no-op that resolves.
  vi.stubGlobal('Audio', class { play = vi.fn().mockResolvedValue(undefined); pause = vi.fn(); });
  vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
});

describe('ClarificationPanel', () => {
  it('shows every pending question as text, so it works without audio', () => {
    render(
      <ClarificationPanel
        quoteId="quote-1"
        clarifications={[clarification(), clarification({ id: 'clar-2', question_nl: 'Hoeveel dakramen?' })]}
        onResolved={vi.fn()}
      />,
    );
    expect(screen.getByText('Welk type dakpannen wil je gebruiken?')).toBeInTheDocument();
    expect(screen.getByText('Hoeveel dakramen?')).toBeInTheDocument();
  });

  it('reports how many questions are still open', () => {
    render(
      <ClarificationPanel
        quoteId="quote-1"
        clarifications={[clarification(), clarification({ id: 'clar-2', status: 'resolved' })]}
        onResolved={vi.fn()}
      />,
    );
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
  });

  it('marks a question resolved after a successful spoken answer', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ resolved: true, question: 'Welk type dakpannen wil je gebruiken?', retryCount: 0 }),
    });
    const onResolved = vi.fn();

    render(<ClarificationPanel quoteId="quote-1" clarifications={[clarification()]} onResolved={onResolved} />);
    await userEvent.click(screen.getByRole('button', { name: /antwoord opnemen/i }));

    await waitFor(() => expect(onResolved).toHaveBeenCalled());
  });

  it('shows the rephrased question when the answer did not resolve it', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        resolved: false,
        question: 'Zijn het kleipannen of betonpannen?',
        retryCount: 1,
        canRetry: true,
      }),
    });

    render(<ClarificationPanel quoteId="quote-1" clarifications={[clarification()]} onResolved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /antwoord opnemen/i }));

    await waitFor(() =>
      expect(screen.getByText('Zijn het kleipannen of betonpannen?')).toBeInTheDocument(),
    );
  });

  it('tells the contractor to answer manually once the retry cap is hit', async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ resolved: false, question: 'Welk type?', retryCount: 2, canRetry: false }),
    });

    render(<ClarificationPanel quoteId="quote-1" clarifications={[clarification()]} onResolved={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /antwoord opnemen/i }));

    await waitFor(() =>
      expect(screen.getByText(/vul dit handmatig aan/i)).toBeInTheDocument(),
    );
  });

  it('lets the contractor dismiss a question as not applicable', async () => {
    const onResolved = vi.fn();
    render(<ClarificationPanel quoteId="quote-1" clarifications={[clarification()]} onResolved={onResolved} />);

    await userEvent.click(screen.getByRole('button', { name: /niet van toepassing/i }));

    await waitFor(() => expect(dismissClarification).toHaveBeenCalledWith('clar-1'));
  });

  it('shows a Dutch error and keeps the question pending when dismiss fails', async () => {
    dismissClarification.mockRejectedValueOnce(new Error('Bijwerken mislukt. Probeer opnieuw.'));
    const onResolved = vi.fn();

    render(<ClarificationPanel quoteId="quote-1" clarifications={[clarification()]} onResolved={onResolved} />);
    await userEvent.click(screen.getByRole('button', { name: /niet van toepassing/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/verwijderen mislukt/i);
    expect(screen.getByText('Welk type dakpannen wil je gebruiken?')).toBeInTheDocument();
    expect(screen.getByTestId('pending-count')).toHaveTextContent('1');
    expect(onResolved).not.toHaveBeenCalled();
  });

  it('says everything is answered when nothing is pending', () => {
    render(
      <ClarificationPanel
        quoteId="quote-1"
        clarifications={[clarification({ status: 'resolved' })]}
        onResolved={vi.fn()}
      />,
    );
    expect(screen.getByText(/alle vragen beantwoord/i)).toBeInTheDocument();
  });
});
