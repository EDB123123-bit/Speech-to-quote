import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectPdf, UnsupportedPdfError } from '../pdf';

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: () => ({
    promise: Promise.reject(new Error('Setting up fake worker failed')),
    destroy: vi.fn().mockResolvedValue(undefined),
  }),
}));

afterEach(() => vi.restoreAllMocks());

describe('inspectPdf worker failures', () => {
  it('keeps a missing worker retryable instead of rejecting the customer PDF', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const structurallyPlausiblePdf = new TextEncoder().encode('%PDF-1.7\n');

    const error = await inspectPdf(structurallyPlausiblePdf).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnsupportedPdfError);
    expect((error as Error).message).toBe('Setting up fake worker failed');
    expect(log).toHaveBeenCalledWith(expect.stringContaining('quote_import_pdf_parse_failed'));
  });
});
