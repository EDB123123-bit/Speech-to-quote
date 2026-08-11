import { describe, it, expect, vi, beforeEach } from 'vitest';
import { movePipelineStage } from '@/lib/quotes/pipeline-move';
import type { PipelineStage, Quote, QuoteLineItem } from '@/lib/supabase/types';

const draftQuote: Quote = {
  id: 'q1', contractor_id: 'c1', transcript: null, status: 'draft',
  // Complete enough to pass checkFinalizeGate — the "finalizes successfully"
  // test below relies on this being a real gate-passing quote, not just a
  // status flag. A separate test overrides fields to exercise the blocked path.
  customer_name: 'Jan Peeters', customer_address: 'Kerkstraat 1, 9000 Gent',
  customer_email: null, customer_phone: null,
  audio_path: null, audio_deleted_at: null, pdf_path: null, pipeline_stage_id: null,
  created_at: '2026-08-06T00:00:00Z',
};

const finalQuote: Quote = { ...draftQuote, status: 'final' };

const line: QuoteLineItem = {
  id: 'line-1', quote_id: 'q1', catalog_item_id: 'cat-1', description: 'Dakpannen',
  quantity: 80, unit: 'm²', unit_price_cents: 3000, vat_rate: 0.06,
  line_type: 'materials', sort_order: 0, created_at: '2026-08-06T00:00:00Z',
};

const ownStage: PipelineStage = {
  id: 's1', contractor_id: 'c1', name: 'Gewonnen', sort_order: 1, created_at: '2026-08-06T00:00:00Z',
};
const otherContractorStage: PipelineStage = { ...ownStage, id: 's2', contractor_id: 'someone-else' };

function makeDeps(overrides = {}) {
  return {
    loadQuote: vi.fn().mockResolvedValue(draftQuote),
    loadStage: vi.fn().mockResolvedValue(ownStage),
    setStage: vi.fn().mockResolvedValue(undefined),
    finalizeDeps: {
      loadQuote: vi.fn().mockResolvedValue(draftQuote),
      loadLineItems: vi.fn().mockResolvedValue([line]),
      loadClarifications: vi.fn().mockResolvedValue([]),
      updateStatusToFinal: vi.fn().mockResolvedValue(undefined),
      loadContractor: vi.fn().mockResolvedValue(null),
      renderPdf: vi.fn(),
      uploadPdf: vi.fn(),
      savePdfPath: vi.fn(),
      log: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('movePipelineStage', () => {
  it('returns an error when the quote does not exist', async () => {
    const deps = makeDeps({ loadQuote: vi.fn().mockResolvedValue(null) });
    const result = await movePipelineStage(deps, 'missing', { type: 'afgewerkt' }, 'c1');
    expect(result).toEqual({ ok: false, error: 'Offerte niet gevonden' });
  });

  it('rejects moving a draft quote to a custom stage', async () => {
    const deps = makeDeps();
    const result = await movePipelineStage(deps, 'q1', { type: 'stage', stageId: 's1' }, 'c1');
    expect(result).toEqual({ ok: false, error: 'Werk de offerte eerst af.' });
    expect(deps.setStage).not.toHaveBeenCalled();
  });

  it('rejects a stage id belonging to a different contractor', async () => {
    const deps = makeDeps({
      loadQuote: vi.fn().mockResolvedValue(finalQuote),
      loadStage: vi.fn().mockResolvedValue(otherContractorStage),
    });
    const result = await movePipelineStage(deps, 'q1', { type: 'stage', stageId: 's2' }, 'c1');
    expect(result).toEqual({ ok: false, error: 'Fase niet gevonden' });
    expect(deps.setStage).not.toHaveBeenCalled();
  });

  it('delegates to finalizeQuote for draft -> afgewerkt and reports its blockers', async () => {
    const finalizeDeps = makeDeps().finalizeDeps;
    finalizeDeps.loadQuote = vi.fn().mockResolvedValue({ ...draftQuote, customer_name: null });
    const deps = makeDeps({ finalizeDeps });

    const result = await movePipelineStage(deps, 'q1', { type: 'afgewerkt' }, 'c1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('klant');
    expect(deps.setStage).not.toHaveBeenCalled();
  });

  it('finalizes successfully for draft -> afgewerkt when the gate passes', async () => {
    const deps = makeDeps();
    const result = await movePipelineStage(deps, 'q1', { type: 'afgewerkt' }, 'c1');
    expect(result).toEqual({ ok: true });
    expect(deps.finalizeDeps.updateStatusToFinal).toHaveBeenCalledWith('q1');
  });

  it('sets pipeline_stage_id to null for final -> afgewerkt', async () => {
    const deps = makeDeps({ loadQuote: vi.fn().mockResolvedValue(finalQuote) });
    const result = await movePipelineStage(deps, 'q1', { type: 'afgewerkt' }, 'c1');
    expect(result).toEqual({ ok: true });
    expect(deps.setStage).toHaveBeenCalledWith('q1', null);
  });

  it('sets pipeline_stage_id to the target stage for final -> stage', async () => {
    const deps = makeDeps({ loadQuote: vi.fn().mockResolvedValue(finalQuote) });
    const result = await movePipelineStage(deps, 'q1', { type: 'stage', stageId: 's1' }, 'c1');
    expect(result).toEqual({ ok: true });
    expect(deps.setStage).toHaveBeenCalledWith('q1', 's1');
  });
});
