import { describe, it, expect, vi, beforeEach } from 'vitest';

// A plain closure (not vi.fn()) is used for `create` deliberately: Vitest
// 4.1.10 has a confirmed bug where a vi.fn()-wrapped mock called across a
// vi.mock() module boundary, when its return value is a rejected promise (or
// it throws), can falsely report an "unhandled error" test failure even
// though the code under test correctly awaits and catches it. See
// transcribe.test.ts / extract.test.ts for the same workaround in Tasks 9/10.
let impl: (args: unknown) => Promise<unknown> = async () => ({ content: [] });

vi.mock('@/lib/ai/anthropic-client', () => ({
  getAnthropic: () => ({ messages: { create: (args: unknown) => impl(args) } }),
  extractionModel: () => 'test-model',
}));

import { processClarificationAnswer, ClarificationError } from '@/lib/ai/clarify';
import type { CatalogItem } from '@/lib/supabase/types';

const catalog: CatalogItem[] = [
  {
    id: 'cat-1', contractor_id: 'c1', name: 'Dakpannen leggen', unit: 'm²',
    materials_price_cents: 3000, labor_price_cents: 1500, vat_rate: 0.06,
    created_at: '2026-08-06T00:00:00Z',
  },
];

const args = {
  originalTranscript: 'tachtig vierkante meter dakpannen',
  question: 'Welk type dakpannen wil je gebruiken?',
  answerTranscript: 'Kleitegels, tachtig vierkante meter.',
  catalog,
  currentLineItems: [],
};

function reply(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

beforeEach(() => {
  impl = async () => ({ content: [] });
});

describe('processClarificationAnswer', () => {
  it('reports the question as resolved when the answer addressed it', async () => {
    impl = async () =>
      reply({ resolved: true, rephrasedQuestionNl: null, newTasks: [], updatedLineItems: [] });
    const result = await processClarificationAnswer(args);
    expect(result.resolved).toBe(true);
  });

  it('returns new tasks the answer introduced', async () => {
    impl = async () =>
      reply({
        resolved: true,
        rephrasedQuestionNl: null,
        newTasks: [{ catalogItemId: 'cat-1', description: 'Dakpannen', quantity: 80, unit: 'm²' }],
        updatedLineItems: [],
      });
    const result = await processClarificationAnswer(args);
    expect(result.newTasks).toHaveLength(1);
    expect(result.newTasks[0].quantity).toBe(80);
  });

  it('returns a rephrased question when the answer missed the point', async () => {
    impl = async () =>
      reply({
        resolved: false,
        rephrasedQuestionNl: 'Zijn het kleipannen of betonpannen?',
        newTasks: [],
        updatedLineItems: [],
      });
    const result = await processClarificationAnswer({ ...args, answerTranscript: 'euh ja' });
    expect(result.resolved).toBe(false);
    expect(result.rephrasedQuestionNl).toBe('Zijn het kleipannen of betonpannen?');
  });

  it('throws ClarificationError on a malformed response', async () => {
    impl = async () => ({ content: [{ type: 'text', text: 'geen JSON' }] });
    await expect(processClarificationAnswer(args)).rejects.toBeInstanceOf(ClarificationError);
  });

  it('throws ClarificationError when the API fails', async () => {
    impl = async () => {
      throw new Error('overloaded');
    };
    await expect(processClarificationAnswer(args)).rejects.toBeInstanceOf(ClarificationError);
  });
});
