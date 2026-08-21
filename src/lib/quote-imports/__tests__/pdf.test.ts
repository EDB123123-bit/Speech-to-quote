import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspectPdf, UnsupportedPdfError } from '../pdf';

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => {
  throw new Error('canvas runtime missing');
});

afterEach(() => vi.restoreAllMocks());

describe('inspectPdf runtime failures', () => {
  it('does not classify a missing parser runtime as an unsupported customer PDF', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const structurallyPlausiblePdf = new TextEncoder().encode('%PDF-1.7\n');

    const error = await inspectPdf(structurallyPlausiblePdf).catch((caught) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(UnsupportedPdfError);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('quote_import_pdf_runtime_load_failed'));
  });
});
