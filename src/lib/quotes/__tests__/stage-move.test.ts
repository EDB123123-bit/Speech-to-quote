import { describe, it, expect } from 'vitest';
import { resolveStageMove, reachableTargets, type MoveTarget } from '@/lib/quotes/stage-move';
import type { PipelineStage } from '@/lib/supabase/types';

function stage(overrides: Partial<PipelineStage> = {}): PipelineStage {
  return {
    id: 'stage-1', contractor_id: 'c1', name: 'Verzonden naar klant',
    sort_order: 1, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

describe('resolveStageMove', () => {
  it('allows draft -> afgewerkt', () => {
    const result = resolveStageMove({ currentStatus: 'draft', target: { type: 'afgewerkt' } });
    expect(result).toEqual({ allowed: true });
  });

  it('blocks draft -> concept (no-op target, should never be called, but defends anyway)', () => {
    const result = resolveStageMove({ currentStatus: 'draft', target: { type: 'concept' } });
    expect(result.allowed).toBe(false);
  });

  it('blocks draft -> a custom stage', () => {
    const target: MoveTarget = { type: 'stage', stageId: 'stage-1' };
    const result = resolveStageMove({ currentStatus: 'draft', target });
    expect(result).toEqual({ allowed: false, reason: 'Werk de offerte eerst af.' });
  });

  it('blocks final -> concept', () => {
    const result = resolveStageMove({ currentStatus: 'final', target: { type: 'concept' } });
    expect(result).toEqual({
      allowed: false,
      reason: 'Een afgewerkte offerte kan niet terug naar concept.',
    });
  });

  it('allows final -> afgewerkt', () => {
    const result = resolveStageMove({ currentStatus: 'final', target: { type: 'afgewerkt' } });
    expect(result).toEqual({ allowed: true });
  });

  it('allows final -> a custom stage', () => {
    const target: MoveTarget = { type: 'stage', stageId: 'stage-1' };
    const result = resolveStageMove({ currentStatus: 'final', target });
    expect(result).toEqual({ allowed: true });
  });
});

describe('reachableTargets', () => {
  const stages = [stage({ id: 's1', name: 'Verzonden naar klant', sort_order: 1 }), stage({ id: 's2', name: 'Gewonnen', sort_order: 2 })];

  it('from concept, only offers afgewerkt', () => {
    const targets = reachableTargets({ type: 'concept' }, stages);
    expect(targets).toEqual([{ label: 'Afgewerkt', target: { type: 'afgewerkt' } }]);
  });

  it('from afgewerkt, offers every custom stage but not concept or afgewerkt itself', () => {
    const targets = reachableTargets({ type: 'afgewerkt' }, stages);
    expect(targets).toEqual([
      { label: 'Verzonden naar klant', target: { type: 'stage', stageId: 's1' } },
      { label: 'Gewonnen', target: { type: 'stage', stageId: 's2' } },
    ]);
  });

  it('from a custom stage, offers afgewerkt and every other stage but not itself or concept', () => {
    const targets = reachableTargets({ type: 'stage', stageId: 's1' }, stages);
    expect(targets).toEqual([
      { label: 'Afgewerkt', target: { type: 'afgewerkt' } },
      { label: 'Gewonnen', target: { type: 'stage', stageId: 's2' } },
    ]);
  });
});
