import { QUOTE_IMPORT_LIMITS } from './constants';

export class UnsupportedPdfError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'UnsupportedPdfError';
  }
}

export async function inspectPdf(pdf: Uint8Array): Promise<{ pageCount: number }> {
  if (pdf.byteLength < 5 || new TextDecoder().decode(pdf.slice(0, 5)) !== '%PDF-') {
    throw new UnsupportedPdfError('invalid_pdf', 'Het bestand is geen geldige pdf.');
  }
  if (pdf.byteLength > QUOTE_IMPORT_LIMITS.maxFileBytes) {
    throw new UnsupportedPdfError('file_limit', 'De pdf is groter dan 20 MB.');
  }
  let pdfjs: typeof import('pdfjs-dist/legacy/build/pdf.mjs');
  try {
    pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (error) {
    console.error(JSON.stringify({
      level: 'error',
      message: 'quote_import_pdf_runtime_load_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    throw error;
  }

  try {
    // PDF.js transfers the supplied typed array to its worker and detaches the
    // underlying ArrayBuffer. Keep ownership of the verified source bytes: the
    // same bytes are encoded for the extractor immediately after inspection.
    const parserPdf = new Uint8Array(pdf);
    const task = pdfjs.getDocument({ data: parserPdf });
    const document = await task.promise;
    const pageCount = document.numPages;
    await task.destroy();
    if (pageCount < 1 || pageCount > QUOTE_IMPORT_LIMITS.maxPages) {
      throw new UnsupportedPdfError('page_limit', 'Een pdf mag maximaal 20 pagina’s bevatten.');
    }
    return { pageCount };
  } catch (error) {
    if (error instanceof UnsupportedPdfError) throw error;
    const name = error instanceof Error ? error.name : '';
    console.error(JSON.stringify({
      level: 'error',
      message: 'quote_import_pdf_parse_failed',
      errorName: name || 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    }));
    if (name === 'PasswordException') throw new UnsupportedPdfError('password_protected', 'Pdf’s met een wachtwoord worden niet ondersteund.');
    if (['InvalidPDFException', 'MissingPDFException', 'UnexpectedResponseException', 'FormatError'].includes(name)) {
      throw new UnsupportedPdfError('invalid_pdf', 'De pdf kon niet veilig gelezen worden.');
    }
    throw error;
  }
}
