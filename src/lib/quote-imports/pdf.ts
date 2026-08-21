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
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: pdf });
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
    if (name === 'PasswordException') throw new UnsupportedPdfError('password_protected', 'Pdf’s met een wachtwoord worden niet ondersteund.');
    throw new UnsupportedPdfError('invalid_pdf', 'De pdf kon niet veilig gelezen worden.');
  }
}
