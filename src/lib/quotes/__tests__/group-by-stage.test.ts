import { describe, it, expect } from 'vitest';
import { groupQuotesByStage, type QuoteWithTotal } from '@/lib/quotes/group-by-stage';
import type { PipelineStage, Quote } from '@/lib/supabase/types';

function quote(overrides: Partial<Quote> = {}): QuoteWithTotal {
  return {
    id: 'q1', contractor_id: 'c1', transcript: null, status: 'draft',
    customer_name: null, customer_address: null, customer_email: null, customer_phone: null,
    audio_path: null, audio_deleted_at: null, pdf_path: null, pipeline_stage_id: null,
    created_at: '2026-08-06T00:00:00Z', grandTotalCents: 0, ...overrides,
  };
}

function stage(overrides: Partial<PipelineStage> = {}): PipelineStage {
  return {
    id: 's1', contractor_id: 'c1', name: 'Verzonden naar klant',
    sort_order: 1, created_at: '2026-08-06T00:00:00Z', ...overrides,
  };
}

describe('groupQuotesByStage', () => {
  it('puts every draft quote in concept, regardless of pipeline_stage_id', () => {
    const q = quote({ id: 'q1', status: 'draft', pipeline_stage_id: 's1' });
    const result = groupQuotesByStage([q], [stage()]);
    expect(result.concept).toEqual([q]);
    expect(result.afgewerkt).toEqual([]);
  });

  it('puts a final quote with no pipeline_stage_id in afgewerkt', () => {
    const q = quote({ id: 'q1', status: 'final', pipeline_stage_id: null });
    const result = groupQuotesByStage([q], [stage()]);
    expect(result.afgewerkt).toEqual([q]);
  });

  it('puts a final quote with a valid pipeline_stage_id in that stage bucket', () => {
    const q = quote({ id: 'q1', status: 'final', pipeline_stage_id: 's1' });
    const result = groupQuotesByStage([q], [stage({ id: 's1' })]);
    expect(result.afgewerkt).toEqual([]);
    expect(result.byStage.get('s1')).toEqual([q]);
  });

  it('falls back to afgewerkt when pipeline_stage_id points at a deleted stage', () => {
    const q = quote({ id: 'q1', status: 'final', pipeline_stage_id: 'deleted-stage' });
    const result = groupQuotesByStage([q], [stage({ id: 's1' })]);
    expect(result.afgewerkt).toEqual([q]);
    expect(result.byStage.get('s1')).toEqual([]);
  });

  it('initializes every stage bucket even when empty', () => {
    const result = groupQuotesByStage([], [stage({ id: 's1' }), stage({ id: 's2', sort_order: 2 })]);
    expect(result.byStage.get('s1')).toEqual([]);
    expect(result.byStage.get('s2')).toEqual([]);
  });
});
