import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateQuote } from '@/lib/quotes/generate';
import { ExtractionError } from '@/lib/ai/extract';

function makeDeps(overrides = {}) {
  return {
    uploadAudio: vi.fn().mockResolvedValue('c1/quote-1.webm'), createDraftQuote: vi.fn().mockResolvedValue('quote-1'),
    transcribe: vi.fn().mockResolvedValue('tachtig vierkante meter dakpannen'),
    extract: vi.fn().mockResolvedValue({ tasks: [{ description: 'Dakpannen', quantity: 80, unit: 'm²', unitPriceCents: null, priceExplicit: false, classification: 'material' }], clarifications: [] }),
    saveTranscript: vi.fn().mockResolvedValue(undefined), saveLineItems: vi.fn().mockResolvedValue(undefined), saveClarifications: vi.fn().mockResolvedValue(undefined), log: vi.fn().mockResolvedValue(undefined), ...overrides,
  };
}
const audio = () => new File([new Uint8Array([1])], 'opname.webm', { type: 'audio/webm' });
beforeEach(() => vi.clearAllMocks());

describe('generateQuote', () => {
  it('creates a catalogue-independent draft line and persists transcript', async () => {
    const deps = makeDeps();
    await expect(generateQuote(deps, { audio: audio(), contractorId: 'c1' })).resolves.toEqual({ quoteId: 'quote-1' });
    expect(deps.saveLineItems.mock.calls[0][1][0]).toMatchObject({ catalog_item_id: null, unit_price_cents: null, price_source: 'unknown', classification: 'material' });
    expect(deps.saveTranscript).toHaveBeenCalledWith('quote-1', 'tachtig vierkante meter dakpannen');
  });

  it('applies a historical suggestion separately from extraction', async () => {
    const deps = makeDeps({ suggestLineItems: vi.fn(async (_id, rows: Array<Record<string, unknown>>) => rows.map((row) => ({ ...row, unit_price_cents: 3200, price_source: 'historical_suggestion' as const }))) });
    await generateQuote(deps, { audio: audio(), contractorId: 'c1' });
    expect(deps.saveLineItems.mock.calls[0][1][0]).toMatchObject({ unit_price_cents: 3200, price_source: 'historical_suggestion' });
  });

  it('propagates a parent quote id when creating a voice change order', async () => {
    const deps = makeDeps();
    await generateQuote(deps, { audio: audio(), contractorId: 'c1', parentQuoteId: 'parent-1' });
    expect(deps.createDraftQuote).toHaveBeenCalledWith('c1', 'c1/quote-1.webm', 'parent-1');
  });

  it('logs extraction fallback without applying a catalogue', async () => {
    const deps = makeDeps({ extract: vi.fn().mockRejectedValue(new ExtractionError('kapot')) });
    await expect(generateQuote(deps, { audio: audio(), contractorId: 'c1' })).resolves.toEqual({ quoteId: 'quote-1' });
    expect(deps.saveLineItems.mock.calls[0][1]).toEqual([]);
    expect(deps.log).toHaveBeenCalledWith(expect.objectContaining({ step: 'extract', status: 'error', detail: expect.objectContaining({ usedFallback: true }) }));
  });

  it('logs transcription failures', async () => {
    const deps = makeDeps({ transcribe: vi.fn().mockRejectedValue(new Error('down')) });
    await expect(generateQuote(deps, { audio: audio(), contractorId: 'c1' })).rejects.toThrow();
    expect(deps.log).toHaveBeenCalledWith(expect.objectContaining({ step: 'transcribe', status: 'error' }));
  });
});
