import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@/lib/ai/openai-client', () => ({
  getOpenAI: () => ({ audio: { transcriptions: { create } } }),
}));

import { transcribeAudio, TranscriptionError } from '@/lib/ai/transcribe';

function audioFile() {
  return new File([new Uint8Array([1, 2, 3])], 'opname.webm', { type: 'audio/webm' });
}

beforeEach(() => create.mockReset());

describe('transcribeAudio', () => {
  it('returns the transcript text', async () => {
    create.mockResolvedValue({ text: 'Tachtig vierkante meter dakpannen vervangen.' });
    await expect(transcribeAudio(audioFile())).resolves.toBe(
      'Tachtig vierkante meter dakpannen vervangen.',
    );
  });

  it('requests Dutch explicitly so Flemish audio is not misdetected', async () => {
    create.mockResolvedValue({ text: 'iets' });
    await transcribeAudio(audioFile());
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ language: 'nl' }));
  });

  it('trims surrounding whitespace', async () => {
    create.mockResolvedValue({ text: '  dakgoot vervangen  ' });
    await expect(transcribeAudio(audioFile())).resolves.toBe('dakgoot vervangen');
  });

  it('throws TranscriptionError when the API fails', async () => {
    create.mockRejectedValue(new Error('rate limited'));
    await expect(transcribeAudio(audioFile())).rejects.toBeInstanceOf(TranscriptionError);
  });

  it('throws TranscriptionError when the transcript is empty', async () => {
    create.mockResolvedValue({ text: '   ' });
    await expect(transcribeAudio(audioFile())).rejects.toBeInstanceOf(TranscriptionError);
  });
});
