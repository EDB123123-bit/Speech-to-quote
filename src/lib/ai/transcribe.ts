import { getOpenAI } from '@/lib/ai/openai-client';

export class TranscriptionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TranscriptionError';
  }
}

export async function transcribeAudio(audio: File): Promise<string> {
  let text: string;

  try {
    const result = await getOpenAI().audio.transcriptions.create({
      file: audio,
      model: process.env.TRANSCRIPTION_MODEL ?? 'whisper-1',
      // Pinned to Dutch: Flemish audio is otherwise sometimes detected as
      // German or Afrikaans, which wrecks the transcript.
      language: 'nl',
    });
    text = (result.text ?? '').trim();
  } catch (error) {
    throw new TranscriptionError('Transcriptie mislukt', { cause: error });
  }

  if (!text) throw new TranscriptionError('Transcriptie leverde geen tekst op');
  return text;
}
