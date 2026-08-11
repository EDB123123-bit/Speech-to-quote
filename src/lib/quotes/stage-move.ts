import type { PipelineStage, QuoteStatus } from '@/lib/supabase/types';

export type MoveTarget =
  | { type: 'concept' }
  | { type: 'afgewerkt' }
  | { type: 'stage'; stageId: string };

export type StageMoveResult = { allowed: true } | { allowed: false; reason: string };

export function resolveStageMove(input: {
  currentStatus: QuoteStatus;
  target: MoveTarget;
}): StageMoveResult {
  const { currentStatus, target } = input;

  if (currentStatus === 'draft') {
    if (target.type === 'afgewerkt') return { allowed: true };
    return { allowed: false, reason: 'Werk de offerte eerst af.' };
  }

  // currentStatus === 'final'
  if (target.type === 'concept') {
    return { allowed: false, reason: 'Een afgewerkte offerte kan niet terug naar concept.' };
  }
  return { allowed: true };
}

export function reachableTargets(
  from: MoveTarget,
  stages: PipelineStage[],
): { label: string; target: MoveTarget }[] {
  const targets: { label: string; target: MoveTarget }[] = [];

  if (from.type === 'concept') {
    targets.push({ label: 'Afgewerkt', target: { type: 'afgewerkt' } });
    return targets;
  }

  if (from.type !== 'afgewerkt') {
    targets.push({ label: 'Afgewerkt', target: { type: 'afgewerkt' } });
  }

  for (const s of stages) {
    if (from.type === 'stage' && from.stageId === s.id) continue;
    targets.push({ label: s.name, target: { type: 'stage', stageId: s.id } });
  }

  return targets;
}
