import type { ExtractedQuoteDocument } from './schema';

export type QuoteExtractionResult = {
  document: ExtractedQuoteDocument;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
};

export interface QuoteDocumentExtractor {
  extract(input: { pdf: Uint8Array; filename: string }): Promise<QuoteExtractionResult>;
}
