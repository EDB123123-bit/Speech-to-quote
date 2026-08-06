import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { checkFinalizeGate } from '@/lib/quotes/finalize-gate';
import { renderQuotePdf } from '@/lib/pdf/render';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import type { Contractor, Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supabase: Awaited<ReturnType<typeof requireContractor>>['supabase'];
  try {
    supabase = (await requireContractor()).supabase;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    }
    throw error;
  }

  const [{ data: quote }, { data: lineItems }, { data: clarifications }] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', id).single(),
    supabase.from('quote_line_items').select('*').eq('quote_id', id),
    supabase.from('quote_clarifications').select('*').eq('quote_id', id),
  ]);

  if (!quote) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });

  const blockers = checkFinalizeGate({
    quote: quote as Quote,
    lineItems: (lineItems ?? []) as QuoteLineItem[],
    clarifications: (clarifications ?? []) as QuoteClarification[],
  });

  if (blockers.length > 0) {
    return NextResponse.json({ blockers }, { status: 422 });
  }

  const { error } = await supabase
    .from('quotes')
    .update({ status: 'final' })
    .eq('id', id)
    .eq('status', 'draft');

  if (error) {
    return NextResponse.json({ error: 'Afwerken mislukt. Probeer opnieuw.' }, { status: 500 });
  }

  // PDF failure must not undo finalizing — the quote is already correct and
  // the PDF can be regenerated on demand from the download route.
  try {
    const { data: contractor } = await supabase
      .from('contractors').select('*').eq('id', quote.contractor_id).single();

    const pdf = await renderQuotePdf({
      contractor: contractor as Contractor,
      quote: { ...(quote as Quote), status: 'final' },
      lineItems: (lineItems ?? []) as QuoteLineItem[],
    });

    const path = `${quote.contractor_id}/${id}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from('quote-pdfs')
      .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    await supabase.from('quotes').update({ pdf_path: path }).eq('id', id);
    await logPipelineEvent({
      quoteId: id, contractorId: quote.contractor_id, step: 'pdf_generate',
      status: 'success', detail: { path },
    });
  } catch (pdfError) {
    await logPipelineEvent({
      quoteId: id, contractorId: quote.contractor_id, step: 'pdf_generate',
      status: 'error', detail: { error: String(pdfError) },
    });
  }

  return NextResponse.json({ ok: true });
}
