// src/components/kanban/__tests__/KanbanBoard.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PipelineStage } from '@/lib/supabase/types';
import type { QuoteWithTotal } from '@/lib/quotes/group-by-stage';

const { moveQuoteToStage } = vi.hoisted(() => ({ moveQuoteToStage: vi.fn() }));
vi.mock('@/app/pijplijn/board-actions', () => ({ moveQuoteToStage }));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const KanbanBoard = (await import('@/components/kanban/KanbanBoard')).default;

function quote(overrides: Partial<QuoteWithTotal> = {}): QuoteWithTotal {
  return {
    id: 'q1', contractor_id: 'c1', transcript: null, status: 'draft',
    customer_name: 'Jan Peeters', customer_address: null, customer_email: null, customer_phone: null,
    audio_path: null, audio_deleted_at: null, pdf_path: null, pipeline_stage_id: null,
    created_at: '2026-08-06T00:00:00Z', grandTotalCents: 12345, ...overrides,
  };
}

const stages: PipelineStage[] = [
  { id: 's1', contractor_id: 'c1', name: 'Gewonnen', sort_order: 1, created_at: '2026-08-06T00:00:00Z' },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('KanbanBoard', () => {
  it('renders a quote under its column and shows its total', () => {
    render(<KanbanBoard quotes={[quote()]} stages={stages} />);
    // "Concept (1)" is split across a text node and a nested <span> (the
    // count), so getByText's default matcher (which only looks at an
    // element's own direct text nodes, not descendant text) can't match it
    // as one string — use a custom matcher against the h2's full textContent.
    expect(
      screen.getByText(
        (_, element) => element?.tagName === 'H2' && element.textContent === 'Concept (1)',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Jan Peeters')).toBeInTheDocument();
    expect(screen.getByText('€ 123,45')).toBeInTheDocument();
  });

  it('moves a card via the "Verplaats naar…" menu and refreshes on success', async () => {
    moveQuoteToStage.mockResolvedValueOnce({ ok: true });
    const user = userEvent.setup();
    render(<KanbanBoard quotes={[quote({ status: 'final' })]} stages={stages} />);

    await user.click(screen.getByText('Verplaats naar…'));
    await user.click(screen.getByRole('button', { name: 'Gewonnen' }));

    expect(moveQuoteToStage).toHaveBeenCalledWith('q1', { type: 'stage', stageId: 's1' });
    expect(refresh).toHaveBeenCalled();
  });

  it('shows the Dutch error and does not refresh when a move is rejected', async () => {
    moveQuoteToStage.mockResolvedValueOnce({ ok: false, error: 'Werk de offerte eerst af.' });
    const user = userEvent.setup();
    render(<KanbanBoard quotes={[quote({ status: 'final' })]} stages={stages} />);

    await user.click(screen.getByText('Verplaats naar…'));
    await user.click(screen.getByRole('button', { name: 'Gewonnen' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Werk de offerte eerst af.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('clears the busy state and shows a Dutch error when moveQuoteToStage throws', async () => {
    moveQuoteToStage.mockRejectedValueOnce(new Error('network down'));
    const user = userEvent.setup();
    render(<KanbanBoard quotes={[quote({ status: 'final' })]} stages={stages} />);

    await user.click(screen.getByText('Verplaats naar…'));
    await user.click(screen.getByRole('button', { name: 'Gewonnen' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Verplaatsen mislukt. Probeer opnieuw.');
    expect(refresh).not.toHaveBeenCalled();

    // The busy state must clear so the move menu becomes usable again
    // without a full page reload (the menu is already open from above).
    expect(await screen.findByRole('button', { name: 'Gewonnen' })).toBeEnabled();
  });
});
