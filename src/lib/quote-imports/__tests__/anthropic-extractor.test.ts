import type Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractedQuoteDocument } from '../schema';

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock('@/lib/ai/anthropic-client', () => ({
  getAnthropic: () => ({ messages: { parse } }),
}));

const {
  extractQuoteWithModelCascade,
  parseQuoteExtractionMessage,
} = await import('../anthropic-extractor');

const observed = <T>(value: T) => ({
  value,
  provenance: { state: 'observed' as const, pageNumber: 1, sourceText: String(value ?? '') },
});
const party = {
  name: observed('Test BV'), address: observed('Teststraat 1'), street: observed('Teststraat 1'),
  postalCode: observed('1000'), city: observed('Brussel'), vatNumber: observed(null),
  enterpriseNumber: observed(null), email: observed(null), phone: observed(null), iban: observed(null),
};

function fixture(): ExtractedQuoteDocument {
  return {
    documentType: 'quote', language: 'nl', currency: 'EUR',
    containsMultipleQuotes: false, containsDiscountOrAllowance: false,
    seller: party, customer: { ...party, name: observed('Klant') },
    quote: {
      number: observed('O-1'), issueDate: observed('2026-08-20'),
      validUntil: observed('2026-09-19'), orderReference: observed(null),
    },
    lines: [{
      description: observed('Plaatsing'), notes: observed(null), quantity: observed(2),
      unit: observed('stuk'), unitCode: observed('C62'), unitPriceExclCents: observed(1000),
      vatRatePercent: observed(21), vatCategory: observed('S'), lineTotalExclCents: observed(2000),
    }],
    totals: {
      subtotalExclCents: observed(2000), vatTotalCents: observed(420), grandTotalCents: observed(2420),
      vatGroups: [{ vatRatePercent: 21, taxableAmountCents: 2000, vatAmountCents: 420 }],
    },
  };
}

function response(document: ExtractedQuoteDocument, inputTokens = 100, outputTokens = 20) {
  return {
    parsed_output: document,
    stop_reason: 'end_turn',
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
  };
}

beforeEach(() => {
  parse.mockReset();
  vi.stubEnv('QUOTE_IMPORT_FAST_MODEL', 'claude-haiku-test');
  vi.stubEnv('QUOTE_IMPORT_FALLBACK_MODEL', 'claude-sonnet-test');
});

afterEach(() => vi.unstubAllEnvs());

describe('Anthropic quote extraction routing', () => {
  it('keeps a clean extraction on Haiku', async () => {
    parse.mockResolvedValueOnce(response(fixture()));
    const result = await extractQuoteWithModelCascade({ pdf: new Uint8Array([1]), filename: 'quote.pdf' });
    expect(result.model).toBe('claude-haiku-test');
    expect(parse).toHaveBeenCalledOnce();
    expect(parse.mock.calls[0][0].model).toBe('claude-haiku-test');
  });

  it('escalates deterministic uncertainty to Sonnet and aggregates usage', async () => {
    const uncertain = fixture();
    uncertain.lines[0].unit = {
      value: null,
      provenance: { state: 'missing', pageNumber: null, sourceText: null },
    };
    parse
      .mockResolvedValueOnce(response(uncertain, 90, 10))
      .mockResolvedValueOnce(response(fixture(), 120, 30));
    const result = await extractQuoteWithModelCascade({ pdf: new Uint8Array([1]), filename: 'quote.pdf' });
    expect(result.model).toBe('claude-haiku-test->claude-sonnet-test');
    expect(result.inputTokens).toBe(210);
    expect(result.outputTokens).toBe(40);
    expect(parse.mock.calls.map(([params]) => params.model)).toEqual([
      'claude-haiku-test',
      'claude-sonnet-test',
    ]);
  });

  it('uses Sonnet when the Haiku request itself fails', async () => {
    parse.mockRejectedValueOnce(new Error('provider timeout')).mockResolvedValueOnce(response(fixture()));
    const result = await extractQuoteWithModelCascade({ pdf: new Uint8Array([1]), filename: 'quote.pdf' });
    expect(result.model).toBe('claude-sonnet-test');
    expect(parse).toHaveBeenCalledTimes(2);
  });

  it('parses structured JSON returned by an asynchronous batch result', () => {
    const message = {
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: JSON.stringify(fixture()) }],
    } as unknown as Anthropic.Message;
    expect(parseQuoteExtractionMessage(message).quote.number.value).toBe('O-1');
  });
});
