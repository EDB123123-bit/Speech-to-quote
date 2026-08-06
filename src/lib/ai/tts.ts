import { getOpenAI } from '@/lib/ai/openai-client';

export class TtsError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TtsError';
  }
}

export async function synthesizeDutchSpeech(text: string): Promise<ArrayBuffer> {
  const input = text.trim();
  if (!input) throw new TtsError('Geen tekst om uit te spreken');

  try {
    const response = await getOpenAI().audio.speech.create({
      model: process.env.TTS_MODEL ?? 'gpt-4o-mini-tts',
      voice: process.env.TTS_VOICE ?? 'alloy',
      input,
    });
    return await response.arrayBuffer();
  } catch (error) {
    throw new TtsError('Spraakgeneratie mislukt', { cause: error });
  }
}
