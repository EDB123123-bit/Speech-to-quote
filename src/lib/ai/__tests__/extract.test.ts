import { describe, it, expect, beforeEach, vi } from 'vitest';

// A plain closure (not vi.fn()) is used for `create` deliberately: Vitest
// 4.1.10 has a confirmed bug where a vi.fn()-wrapped mock called across a
// vi.mock() module boundary, when its return value is a rejected promise (or
// it throws), can falsely report an "unhandled error" test failure even
// though the code under test correctly awaits and catches it. See
// transcribe.test.ts for the same workaround applied in Task 9.
let callCount = 0;
let impl: (args: unknown) => Promise<unknown> = async () => ({ content: [] });

vi.mock('@/lib/ai/anthropic-client', () => ({
  getAnthropic: () => ({
    messages: {
      create: (args: unknown) => {
        callCount += 1;
        return impl(args);
      },
    },
  }),
}));

import { extractQuoteTasks, buildExtractionPrompt, ExtractionError } from '@/lib/ai/extract';
import type { CatalogItem } from '@/lib/supabase/types';

const catalog: CatalogItem[] = [
  {
    id: 'cat-1',
    contractor_id: 'c1',
    name: 'Dakpannen leggen (kleitegels)',
    unit: 'm²',
    materials_price_cents: 3000,
    labor_price_cents: 1500,
    vat_rate: 0.06,
    created_at: '2026-08-06T00:00:00Z',
  },
];

function reply(payload: unknown) {
  return { content: [{ type: 'text', text: JSON.stringify(payload) }] };
}

beforeEach(() => {
  callCount = 0;
  impl = async () => ({ content: [] });
});

describe('buildExtractionPrompt', () => {
  it('includes the transcript', () => {
    const prompt = buildExtractionPrompt('tachtig vierkante meter', catalog);
    expect(prompt).toContain('tachtig vierkante meter');
  });

  it('includes every catalog item with its id and unit', () => {
    const prompt = buildExtractionPrompt('x', catalog);
    expect(prompt).toContain('cat-1');
    expect(prompt).toContain('Dakpannen leggen (kleitegels)');
    expect(prompt).toContain('m²');
  });

  it('states that prices must never be invented', () => {
    expect(buildExtractionPrompt('x', catalog).toLowerCase()).toContain('never invent');
  });
});

describe('extractQuoteTasks', () => {
  it('parses tasks and clarifications', async () => {
    impl = async () =>
      reply({
        tasks: [
          { catalogItemId: 'cat-1', description: 'Dakpannen leggen', quantity: 80, unit: 'm²' },
        ],
        clarifications: [{ questionNl: 'Welk type dakpannen wil je gebruiken?' }],
      });

    const result = await extractQuoteTasks('tachtig vierkante meter dakpannen', catalog);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].quantity).toBe(80);
    expect(result.clarifications[0].questionNl).toBe('Welk type dakpannen wil je gebruiken?');
  });

  it('accepts an empty clarification list', async () => {
    impl = async () => reply({ tasks: [], clarifications: [] });
    const result = await extractQuoteTasks('onduidelijk', catalog);
    expect(result.tasks).toEqual([]);
    expect(result.clarifications).toEqual([]);
  });

  it('tolerates a response wrapped in a markdown code fence', async () => {
    impl = async () => ({
      content: [
        {
          type: 'text',
          text: '```json\n{"tasks":[],"clarifications":[]}\n```',
        },
      ],
    });
    await expect(extractQuoteTasks('x', catalog)).resolves.toEqual({
      tasks: [],
      clarifications: [],
    });
  });

  it('finds the JSON when Anthropic prepends a non-text content block', async () => {
    impl = async () => ({
      content: [
        { type: 'thinking', thinking: 'Ik koppel de werken aan de prijslijst.' },
        { type: 'text', text: '{"tasks":[],"clarifications":[]}' },
      ],
    });

    await expect(extractQuoteTasks('x', catalog)).resolves.toEqual({
      tasks: [],
      clarifications: [],
    });
  });

  it('recovers JSON surrounded by a short model preamble', async () => {
    impl = async () => ({
      content: [{ type: 'text', text: 'Hier is de offerteanalyse:\n{"tasks":[],"clarifications":[]}' }],
    });

    await expect(extractQuoteTasks('x', catalog)).resolves.toEqual({
      tasks: [],
      clarifications: [],
    });
  });

  it('retries once when the first response is malformed', async () => {
    impl = async () => {
      if (callCount === 1) {
        return { content: [{ type: 'text', text: 'niet eens JSON' }] };
      }
      return reply({ tasks: [], clarifications: [] });
    };

    await expect(extractQuoteTasks('x', catalog)).resolves.toEqual({
      tasks: [],
      clarifications: [],
    });
    expect(callCount).toBe(2);
  });

  it('throws ExtractionError when all attempts are malformed', async () => {
    impl = async () => ({ content: [{ type: 'text', text: 'nog steeds geen JSON' }] });
    await expect(extractQuoteTasks('x', catalog)).rejects.toBeInstanceOf(ExtractionError);
    expect(callCount).toBe(3);
  });

  it('throws ExtractionError when the API call itself fails', async () => {
    impl = () => Promise.reject(new Error('overloaded'));
    await expect(extractQuoteTasks('x', catalog)).rejects.toBeInstanceOf(ExtractionError);
  });

  it('rejects a task with a non-positive quantity', async () => {
    impl = async () =>
      reply({
        tasks: [{ catalogItemId: null, description: 'x', quantity: 0, unit: 'm' }],
        clarifications: [],
      });
    await expect(extractQuoteTasks('x', catalog)).rejects.toBeInstanceOf(ExtractionError);
  });
});
