export const QUOTE_IMPORT_LIMITS = {
  maxFiles: 25,
  maxFileBytes: 20 * 1024 * 1024,
  maxBatchBytes: 200 * 1024 * 1024,
  maxPages: 20,
  maxConcurrentProcessing: 2,
  interactiveMaxFiles: 20,
} as const;

export const MAX_BATCH_DOCUMENTS = QUOTE_IMPORT_LIMITS.maxFiles;
export const MAX_DOCUMENT_BYTES = QUOTE_IMPORT_LIMITS.maxFileBytes;
export const MAX_BATCH_BYTES = QUOTE_IMPORT_LIMITS.maxBatchBytes;
export const INTERACTIVE_IMPORT_MAX_DOCUMENTS = QUOTE_IMPORT_LIMITS.interactiveMaxFiles;

export const QUOTE_IMPORT_SCHEMA_VERSION = 'quote-import-2026-08-v1';

export function quoteImportProcessingMode(quoteCount: number): 'interactive' | 'provider_batch' {
  return quoteCount > INTERACTIVE_IMPORT_MAX_DOCUMENTS ? 'provider_batch' : 'interactive';
}

export function quoteImportEnabled(): boolean {
  return process.env.QUOTE_IMPORT_ENABLED === 'true' || process.env.NODE_ENV === 'test';
}

export function quoteImportFastModel(): string {
  return process.env.QUOTE_IMPORT_FAST_MODEL
    ?? 'claude-haiku-4-5';
}

export function quoteImportFallbackModel(): string {
  return process.env.QUOTE_IMPORT_FALLBACK_MODEL
    ?? process.env.QUOTE_IMPORT_MODEL
    ?? process.env.EXTRACTION_MODEL
    ?? 'claude-sonnet-5';
}

export function quoteImportBatchModel(): string {
  return process.env.QUOTE_IMPORT_BATCH_MODEL
    ?? quoteImportFallbackModel();
}
