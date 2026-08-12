// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PipelineStage } from '@/lib/supabase/types';

const { createStage, deleteStage, renameStage, reorderStage } = vi.hoisted(() => ({
  createStage: vi.fn().mockResolvedValue({ ok: true }),
  deleteStage: vi.fn().mockResolvedValue({ ok: true }),
  renameStage: vi.fn().mockResolvedValue({ ok: true }),
  reorderStage: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@/app/instellingen/pipeline-stage-actions', () => ({
  createStage, deleteStage, renameStage, reorderStage,
}));

const PipelineStagesForm = (await import('@/app/instellingen/PipelineStagesForm')).default;

const stage: PipelineStage = {
  id: 's1', contractor_id: 'c1', name: 'Gewonnen', sort_order: 0, created_at: '2026-08-06T00:00:00Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PipelineStagesForm', () => {
  it('surfaces the Dutch error from a failed delete', async () => {
    deleteStage.mockResolvedValueOnce({ ok: false, error: 'Verplaats eerst de 3 offerte(s) uit deze fase voordat je deze fase verwijdert.' });
    const user = userEvent.setup();
    render(<PipelineStagesForm stages={[stage]} />);

    await user.click(screen.getByRole('button', { name: `Verwijder ${stage.name}` }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Verplaats eerst de 3 offerte(s)');
  });

  it('disables the up arrow on the first stage and the down arrow on the last', () => {
    const second: PipelineStage = { ...stage, id: 's2', name: 'Verloren', sort_order: 1 };
    render(<PipelineStagesForm stages={[stage, second]} />);

    expect(screen.getByRole('button', { name: 'Gewonnen omhoog verplaatsen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Verloren omlaag verplaatsen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gewonnen omlaag verplaatsen' })).toBeEnabled();
  });

  it('calls reorderStage with the right direction', async () => {
    const second: PipelineStage = { ...stage, id: 's2', name: 'Verloren', sort_order: 1 };
    const user = userEvent.setup();
    render(<PipelineStagesForm stages={[stage, second]} />);

    await user.click(screen.getByRole('button', { name: 'Gewonnen omlaag verplaatsen' }));
    expect(reorderStage).toHaveBeenCalledWith('s1', 'down');
  });
});
