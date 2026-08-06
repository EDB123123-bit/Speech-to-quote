import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

export function extractionModel(): string {
  return process.env.EXTRACTION_MODEL ?? 'claude-sonnet-5';
}
