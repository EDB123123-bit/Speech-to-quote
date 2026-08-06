import { describe, it, expect, beforeEach, vi } from 'vitest';

let lastCallArgs: unknown;
let called = false;
let impl: (args: unknown) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }> = async () => ({
  arrayBuffer: async () => new ArrayBuffer(0),
});

vi.mock('@/lib/ai/openai-client', () => ({
  getOpenAI: () => ({
    audio: {
      speech: {
        create: (args: unknown) => {
          called = true;
          lastCallArgs = args;
          return impl(args);
        },
      },
    },
  }),
}));

import { synthesizeDutchSpeech, TtsError } from '@/lib/ai/tts';

beforeEach(() => {
  called = false;
  lastCallArgs = undefined;
  impl = async () => ({ arrayBuffer: async () => new ArrayBuffer(0) });
});

describe('synthesizeDutchSpeech', () => {
  it('returns the audio bytes', async () => {
    const bytes = new ArrayBuffer(8);
    impl = async () => ({ arrayBuffer: async () => bytes });
    await expect(synthesizeDutchSpeech('Welk type dakpannen?')).resolves.toBe(bytes);
  });

  it('sends the text to the configured model and voice', async () => {
    impl = async () => ({ arrayBuffer: async () => new ArrayBuffer(1) });
    await synthesizeDutchSpeech('Welk type dakpannen?');
    expect(lastCallArgs).toEqual(expect.objectContaining({ input: 'Welk type dakpannen?' }));
  });

  it('rejects empty text rather than calling the API', async () => {
    await expect(synthesizeDutchSpeech('   ')).rejects.toBeInstanceOf(TtsError);
    expect(called).toBe(false);
  });

  it('throws TtsError when the API fails', async () => {
    impl = () => Promise.reject(new Error('quota'));
    await expect(synthesizeDutchSpeech('iets')).rejects.toBeInstanceOf(TtsError);
  });
});
