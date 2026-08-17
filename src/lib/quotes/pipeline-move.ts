import { resolveStageMove, type MoveTarget } from '@/lib/quotes/stage-move';
import { finalizeQuote, type FinalizeDeps } from '@/lib/quotes/finalize';
import type { PipelineStage, Quote } from '@/lib/supabase/types';

export type PipelineMoveDeps = {
  loadQuote: (quoteId: string) => Promise<Quote | null>;
  loadStage: (stageId: string) => Promise<PipelineStage | null>;
  setStage: (quoteId: string, stageId: string | null) => Promise<void>;
  finalizeDeps: FinalizeDeps;
};

export type MoveResult = { ok: true } | { ok: false; error: string };

function finalizeErrorMessage(result: Awaited<ReturnType<typeof finalizeQuote>>): string {
  if (!result.ok && 'blockers' in result) return result.blockers.map((b) => b.messageNl).join(' ');
  if (!result.ok && 'error' in result) return result.error;
  return 'Afwerken mislukt. Probeer opnieuw.';
}

export async function movePipelineStage(
  deps: PipelineMoveDeps,
  quoteId: string,
  target: MoveTarget,
  contractorId: string,
): Promise<MoveResult> {
  const quote = await deps.loadQuote(quoteId);
  if (!quote) return { ok: false, error: 'Offerte niet gevonden' };

  if (target.type === 'stage') {
    const stage = await deps.loadStage(target.stageId);
    if (!stage || stage.contractor_id !== contractorId) {
      return { ok: false, error: 'Fase niet gevonden' };
    }
  }

  const decision = resolveStageMove({ currentStatus: quote.status, target });
  if (!decision.allowed) return { ok: false, error: decision.reason };

  if (quote.status === 'draft' && target.type === 'afgewerkt') {
    const result = await finalizeQuote(deps.finalizeDeps, quoteId);
    if (!result.ok) return { ok: false, error: finalizeErrorMessage(result) };
    return { ok: true };
  }

  const stageId = target.type === 'stage' ? target.stageId : null;
  await deps.setStage(quoteId, stageId);
  return { ok: true };
}
