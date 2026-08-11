import { describe, it, expect, vi, beforeEach } from 'vitest';
import { finalizeQuote } from '@/lib/quotes/finalize';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

const contractor: Contractor = {
  id: 'c1', company_name: 'Dakwerken Janssens', address: null, vat_number: null,
  phone: null, onboarding_completed_at: null, created_at: '2026-08-06T00:00:00Z',
};

const draftQuote: Quote = {
  id: 'q1', contractor_id: 'c1', transcript: 'test', status: 'draft',
  customer_name: 'Jan Peeters', customer_address: 'Kerkstraat 1, 9000 Gent',
  customer_email: null, customer_phone: null, audio_path: null, audio_deleted_at: null,
  pdf_path: null, pipeline_stage_id: null, created_at: '2026-08-06T00:00:00Z',
};

const line: QuoteLineItem = {
  id: 'line-1', quote_id: 'q1', catalog_item_id: 'cat-1', description: 'Dakpannen',
  quantity: 80, unit: 'm²', unit_price_cents: 3000, vat_rate: 0.06,
  line_type: 'materials', sort_order: 0, created_at: '2026-08-06T00:00:00Z',
};

function makeDeps(overrides = {}) {
  return {
    loadQuote: vi.fn().mockResolvedValue(draftQuote),
    loadLineItems: vi.fn().mockResolvedValue([line]),
    loadClarifications: vi.fn().mockResolvedValue([]),
    updateStatusToFinal: vi.fn().mockResolvedValue(undefined),
    loadContractor: vi.fn().mockResolvedValue(contractor),
    renderPdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    uploadPdf: vi.fn().mockResolvedValue(undefined),
    savePdfPath: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('finalizeQuote', () => {
  it('returns blockers and does not touch status/PDF when the gate fails', async () => {
    const deps = makeDeps({ loadQuote: vi.fn().mockResolvedValue({ ...draftQuote, customer_name: null }) });
    const result = await finalizeQuote(deps, 'q1');

    expect(result.ok).toBe(false);
    if (!result.ok && 'blockers' in result) {
      expect(result.blockers.map((b) => b.code)).toContain('missing_customer');
    }
    expect(deps.updateStatusToFinal).not.toHaveBeenCalled();
    expect(deps.renderPdf).not.toHaveBeenCalled();
  });

  it('returns a distinct 404 result when the quote does not exist', async () => {
    const deps = makeDeps({ loadQuote: vi.fn().mockResolvedValue(null) });
    const result = await finalizeQuote(deps, 'missing');

    expect(result).toEqual({ ok: false, status: 404, error: 'Offerte niet gevonden' });
    expect(deps.updateStatusToFinal).not.toHaveBeenCalled();
    expect(deps.renderPdf).not.toHaveBeenCalled();
  });

  it('returns a 500 result instead of throwing when updateStatusToFinal fails', async () => {
    const deps = makeDeps({ updateStatusToFinal: vi.fn().mockRejectedValue(new Error('db boom')) });

    await expect(finalizeQuote(deps, 'q1')).resolves.toEqual({
      ok: false,
      status: 500,
      error: 'Afwerken mislukt. Probeer opnieuw.',
    });
    expect(deps.renderPdf).not.toHaveBeenCalled();
    expect(deps.log).not.toHaveBeenCalled();
  });

  it('flips status to final and generates a PDF on success', async () => {
    const deps = makeDeps();
    const result = await finalizeQuote(deps, 'q1');

    expect(result).toEqual({ ok: true });
    expect(deps.updateStatusToFinal).toHaveBeenCalledWith('q1');
    expect(deps.uploadPdf).toHaveBeenCalledWith('c1/q1.pdf', expect.any(Uint8Array));
    expect(deps.savePdfPath).toHaveBeenCalledWith('q1', 'c1/q1.pdf');
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'pdf_generate', status: 'success' }),
    );
  });

  it('still reports success when PDF generation fails — the finalize itself already succeeded', async () => {
    const deps = makeDeps({ renderPdf: vi.fn().mockRejectedValue(new Error('pdf boom')) });
    const result = await finalizeQuote(deps, 'q1');

    expect(result).toEqual({ ok: true });
    expect(deps.updateStatusToFinal).toHaveBeenCalledWith('q1');
    expect(deps.log).toHaveBeenCalledWith(
      expect.objectContaining({ step: 'pdf_generate', status: 'error' }),
    );
  });
});
