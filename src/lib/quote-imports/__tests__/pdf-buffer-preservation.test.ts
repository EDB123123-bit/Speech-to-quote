import { describe, expect, it, vi } from 'vitest';
import { buildQuoteExtractionParams } from '../anthropic-extractor';
import { inspectPdf } from '../pdf';

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument: ({ data }: { data: Uint8Array }) => {
    structuredClone(data.buffer, { transfer: [data.buffer] });
    return {
      promise: Promise.resolve({ numPages: 1 }),
      destroy: vi.fn().mockResolvedValue(undefined),
    };
  },
}));

describe('inspectPdf buffer ownership', () => {
  it('preserves the source bytes when PDF.js transfers its parser input', async () => {
    const source = new TextEncoder().encode('%PDF-1.7\nquote');
    const expected = new Uint8Array(source);

    await expect(inspectPdf(source)).resolves.toEqual({ pageCount: 1 });

    expect(source.byteLength).toBe(expected.byteLength);
    expect(source).toEqual(expected);

    const params = buildQuoteExtractionParams({
      pdf: source,
      filename: 'quote.pdf',
      model: 'claude-test',
    });
    const content = params.messages[0].content;
    expect(Array.isArray(content)).toBe(true);
    const documentBlock = Array.isArray(content) ? content[0] : null;
    expect(documentBlock).toMatchObject({
      type: 'document',
      source: {
        type: 'base64',
        data: Buffer.from(expected).toString('base64'),
      },
    });
  });
});
