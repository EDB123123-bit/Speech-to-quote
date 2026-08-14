import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateQuote, EmptyCatalogError } from '@/lib/quotes/generate';
import { ExtractionError } from '@/lib/ai/extract';
import type { CatalogItem } from '@/lib/supabase/types';

const catalog: CatalogItem[] = [
  {
    id: 'cat-1',
    contractor_id: 'c1',
    name: 'Dakpannen leggen',
    unit: 'm²',
    materials_price_cents: 3000,
    labor_price_cents: 1500,
    vat_rate: 0.06,
    created_at: '2026-08-06T00:00:00Z',
  },
];

function makeDeps(overrides = {}) {
  return {
    loadCatalog: vi.fn().mockResolvedValue(catalog),
    uploadAudio: vi.fn().mockResolvedValue('c1/quote-1.webm'),
    createDraftQuote: vi.fn().mockResolvedValue('quote-1'),
    transcribe: vi.fn().mockResolvedValue('tachtig vierkante meter dakpannen'),
    extract: vi.fn().mockResolvedValue({
      tasks: [{ catalogItemId: 'cat-1', description: 'Dakpannen', quantity: 80, unit: 'm²' }],
      clarifications: [{ questionNl: 'Welk type dakpannen?' }],
    }),
    saveTranscript: vi.fn().mockResolvedValue(undefined),
    saveLineItems: vi.fn().mockResolvedValue(undefined),
    saveClarifications: vi.fn().mockResolvedValue(undefined),
    log: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const audio = () => new File([new Uint8Array([1])], 'opname.webm', { type: 'audio/webm' });

beforeEach(() => vi.clearAllMocks());

describe('generateQuote', () => {
  it('returns the new quote id', async () => {
    const deps = makeDeps();
    const result = await generateQuote(deps, { audio: audio(), contractorId: 'c1' });
    expect(result.quoteId).toBe('quote-1');
  });

  it('expands each matched task into a materials row and a labor row', async () => {
    const deps = makeDeps();
    await generateQuote(deps, { audio: audio(), contractorId: 'c1' });

    const rows = deps.saveLineItems.mock.calls[0][1];
    expect(rows).toHaveLength(2);
    expect(rows.map((r: { line_type: string }) => r.line_type)).toEqual(['materials', 'labor']);
  });

  it('recovers a priced catalog item that the model omitted', async () => {
    const windows: CatalogItem = {
      id: 'cat-2', contractor_id: 'c1', name: 'Ramen', unit: 'stuk',
      materials_price_cents: 100000, labor_price_cents: 50000, vat_rate: 0.21,
      created_at: '2026-08-06T00:00:00Z',
    };
    const deps = makeDeps({
      loadCatalog: vi.fn().mockResolvedValue([...catalog, windows]),
      transcribe: vi.fn().mockResolvedValue('20 vierkante meter en 2 ramen'),
      extract: vi.fn().mockResolvedValue({ tasks: [], clarifications: [] }),
    });

    await generateQuote(deps, { audio: audio(), contractorId: 'c1' });

    const rows = deps.saveLineItems.mock.calls[0][1] as Array<{
      catalog_item_id: string | null;
      quantity: number;
    }>;
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.catalog_item_id === 'cat-2')).toBe(true);
    expect(rows.every((row) => row.quantity === 2)).toBe(true);
    expect(deps.saveClarifications).toHaveBeenCalledWith('quote-1', []);
  });

  it('persists the transcript and the clarifications', async () => {
    const deps = makeDeps();
    await generateQuote(deps, { audio: audio(), contractorId: 'c1' });

    expect(deps.saveTranscript).toHaveBeenCalledWith('quote-1', 'tachtig vierkante meter dakpannen');
    expect(deps.saveClarifications).toHaveBeenCalledWith('quote-1', [
      { questionNl: 'Welk type dakpannen?' },
    ]);
  });

  it('refuses to start when the catalog is empty', async () => {
    const deps = makeDeps({ loadCatalog: vi.fn().mockResolvedValue([]) });
    await expect(
      generateQuote(deps, { audio: audio(), contractorId: 'c1' }),
    ).rejects.toBeInstanceOf(EmptyCatalogError);
    expect(deps.createDraftQuote).not.toHaveBeenCalled();
  });

  it('logs a success event for each pipeline step', async () => {
    const deps = makeDeps();
    await generateQuote(deps, { audio: audio(), contractorId: 'c1' });

    const steps = deps.log.mock.calls.map((call) => (call[0] as { step: string }).step);
    expect(steps).toContain('upload');
    expect(steps).toContain('transcribe');
    expect(steps).toContain('extract');
  });

  it('logs an error event and rethrows when transcription fails', async () => {
    const deps = makeDeps({ transcribe: vi.fn().mockRejectedValue(new Error('whisper down')) });
    await expect(generateQuote(deps, { audio: audio(), contractorId: 'c1' })).rejects.toThrow();

    const errorLogs = deps.log.mock.calls
      .map((call) => call[0] as { step: string; status: string })
      .filter((event) => event.status === 'error');
    expect(errorLogs.some((e) => e.step === 'transcribe')).toBe(true);
  });

  it('logs an error event and rethrows when saving the transcript fails', async () => {
    const deps = makeDeps({
      saveTranscript: vi.fn().mockRejectedValue(new Error('Opslaan van transcript mislukt')),
    });

    await expect(generateQuote(deps, { audio: audio(), contractorId: 'c1' })).rejects.toThrow(
      'Opslaan van transcript mislukt',
    );

    const errorLogs = deps.log.mock.calls
      .map((call) => call[0] as { step: string; status: string })
      .filter((event) => event.status === 'error');
    expect(errorLogs.some((e) => e.step === 'transcribe')).toBe(true);
    expect(deps.extract).not.toHaveBeenCalled();
  });

  it('keeps the draft quote when extraction fails, so the contractor can fill it in manually', async () => {
    const deps = makeDeps({
      extract: vi.fn().mockRejectedValue(new ExtractionError('kapot')),
    });

    await expect(
      generateQuote(deps, { audio: audio(), contractorId: 'c1' }),
    ).rejects.toMatchObject({ quoteId: 'quote-1' });

    // Transcript is still saved — it is the contractor's record of what they said.
    expect(deps.saveTranscript).toHaveBeenCalledWith('quote-1', 'tachtig vierkante meter dakpannen');
    expect(deps.saveLineItems).not.toHaveBeenCalled();
  });
});
