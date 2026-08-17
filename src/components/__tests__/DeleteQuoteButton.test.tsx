// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeleteQuoteButton from '@/components/DeleteQuoteButton';
import { deleteQuote } from '@/app/offertes/quote-actions';

const refresh = vi.fn();
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push }) }));
vi.mock('@/app/offertes/quote-actions', () => ({ deleteQuote: vi.fn().mockResolvedValue(undefined) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
});

describe('DeleteQuoteButton', () => {
  it('asks for confirmation and refreshes after deleting a quote', async () => {
    render(<DeleteQuoteButton quoteId="quote-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Verwijderen' }));

    await waitFor(() => expect(deleteQuote).toHaveBeenCalledWith('quote-1'));
    expect(refresh).toHaveBeenCalled();
  });

  it('does not delete when confirmation is cancelled', async () => {
    (confirm as ReturnType<typeof vi.fn>).mockReturnValueOnce(false);
    render(<DeleteQuoteButton quoteId="quote-1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Verwijderen' }));

    expect(deleteQuote).not.toHaveBeenCalled();
  });
});
