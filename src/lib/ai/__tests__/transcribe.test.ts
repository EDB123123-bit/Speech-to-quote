import { describe, it, expect, beforeEach, vi } from 'vitest';

let lastCallArgs: unknown;
let impl: (args: unknown) => Promise<{ text: string }> = async () => ({ text: '' });

vi.mock('@/lib/ai/openai-client', () => ({
  getOpenAI: () => ({
    audio: {
      transcriptions: {
        create: (args: unknown) => {
          lastCallArgs = args;
          return impl(args);
        },
      },
    },
  }),
}));

import { transcribeAudio, TranscriptionError } from '@/lib/ai/transcribe';

function audioFile() {
  return new File([new Uint8Array([1, 2, 3])], 'opname.webm', { type: 'audio/webm' });
}

beforeEach(() => {
  lastCallArgs = undefined;
  impl = async () => ({ text: '' });
});

describe('transcribeAudio', () => {
  it('returns the transcript text', async () => {
    impl = async () => ({ text: 'Tachtig vierkante meter dakpannen vervangen.' });
    await expect(transcribeAudio(audioFile())).resolves.toBe(
      'Tachtig vierkante meter dakpannen vervangen.',
    );
  });

  it('requests Dutch explicitly so Flemish audio is not misdetected', async () => {
    impl = async () => ({ text: 'iets' });
    await transcribeAudio(audioFile());
    expect(lastCallArgs).toEqual(expect.objectContaining({ language: 'nl' }));
  });

  it('trims surrounding whitespace', async () => {
    impl = async () => ({ text: '  dakgoot vervangen  ' });
    await expect(transcribeAudio(audioFile())).resolves.toBe('dakgoot vervangen');
  });

  it('throws TranscriptionError when the API fails', async () => {
    impl = () => Promise.reject(new Error('rate limited'));
    await expect(transcribeAudio(audioFile())).rejects.toBeInstanceOf(TranscriptionError);
  });

  it('throws TranscriptionError when the transcript is empty', async () => {
    impl = async () => ({ text: '   ' });
    await expect(transcribeAudio(audioFile())).rejects.toBeInstanceOf(TranscriptionError);
  });
});
