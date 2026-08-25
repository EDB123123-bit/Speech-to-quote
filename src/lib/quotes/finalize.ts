import { checkFinalizeGate, type FinalizeBlocker } from '@/lib/quotes/finalize-gate';
import type { Contractor, Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export type FinalizeDeps = {
  loadQuote: (quoteId: string) => Promise<Quote | null>;
  loadLineItems: (quoteId: string) => Promise<QuoteLineItem[]>;
  loadClarifications: (quoteId: string) => Promise<QuoteClarification[]>;
  updateStatusToFinal: (quoteId: string) => Promise<void>;
  loadContractor: (contractorId: string) => Promise<Contractor | null>;
  loadParentQuoteNumber?: (parentQuoteId: string) => Promise<string | null>;
  renderPdf: (input: { contractor: Contractor; quote: Quote; lineItems: QuoteLineItem[]; originalQuoteNumber?: string | null }) => Promise<Uint8Array>;
  uploadPdf: (path: string, pdf: Uint8Array) => Promise<void>;
  savePdfPath: (quoteId: string, path: string) => Promise<void>;
  log: (event: {
    quoteId: string;
    contractorId: string;
    step: 'pdf_generate';
    status: 'success' | 'error';
    detail: Record<string, unknown>;
  }) => Promise<void>;
};

export type FinalizeResult =
  | { ok: true }
  | { ok: false; blockers: FinalizeBlocker[] }
  | { ok: false; status: 404; error: string }
  | { ok: false; status: 500; error: string };

export async function finalizeQuote(deps: FinalizeDeps, quoteId: string): Promise<FinalizeResult> {
  const quote = await deps.loadQuote(quoteId);
  if (!quote) return { ok: false, status: 404, error: 'Offerte niet gevonden' };

  const [lineItems, clarifications] = await Promise.all([
    deps.loadLineItems(quoteId),
    deps.loadClarifications(quoteId),
  ]);

  const blockers = checkFinalizeGate({ quote, lineItems, clarifications });
  if (blockers.length > 0) return { ok: false, blockers };

  try {
    await deps.updateStatusToFinal(quoteId);
  } catch {
    // Matches the original inline route: any DB failure here (e.g. the row was
    // no longer in 'draft' status, or a genuine write error) surfaces the same
    // generic Dutch message rather than leaking Supabase internals.
    return { ok: false, status: 500, error: 'Afwerken mislukt. Probeer opnieuw.' };
  }

  // PDF failure must not undo finalizing — the quote is already correct and
  // the PDF can be regenerated on demand from the download route.
  try {
    const contractor = await deps.loadContractor(quote.contractor_id);
    if (!contractor) throw new Error('Contractor niet gevonden');

    const originalQuoteNumber = quote.parent_quote_id && deps.loadParentQuoteNumber
      ? await deps.loadParentQuoteNumber(quote.parent_quote_id)
      : null;
    const pdf = await deps.renderPdf({
      contractor,
      quote: { ...quote, status: 'final' },
      lineItems,
      originalQuoteNumber,
    });

    const path = `${quote.contractor_id}/${quoteId}.pdf`;
    await deps.uploadPdf(path, pdf);
    await deps.savePdfPath(quoteId, path);

    await deps.log({
      quoteId, contractorId: quote.contractor_id, step: 'pdf_generate',
      status: 'success', detail: { path },
    });
  } catch (pdfError) {
    await deps.log({
      quoteId, contractorId: quote.contractor_id, step: 'pdf_generate',
      status: 'error', detail: { error: String(pdfError) },
    });
  }

  return { ok: true };
}
