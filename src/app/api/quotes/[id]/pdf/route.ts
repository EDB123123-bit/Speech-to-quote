import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { renderQuotePdf } from '@/lib/pdf/render';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supabase: Awaited<ReturnType<typeof requireContractor>>['supabase'];
  let contractor: Contractor;
  try {
    const auth = await requireContractor();
    supabase = auth.supabase;
    contractor = auth.contractor;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    }
    throw error;
  }

  const { data: quote } = await supabase.from('quotes').select('*').eq('id', id).single();
  if (!quote) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });

  let path = (quote as Quote).pdf_path;

  // Regenerate on demand when finalizing produced no PDF.
  if (!path) {
    try {
      const { data: lineItems } = await supabase
        .from('quote_line_items').select('*').eq('quote_id', id);

      const pdf = await renderQuotePdf({
        contractor,
        quote: quote as Quote,
        lineItems: (lineItems ?? []) as QuoteLineItem[],
      });

      path = `${contractor.id}/${id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from('quote-pdfs')
        .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      if (uploadError) throw new Error(uploadError.message);

      const { error: pdfPathError } = await supabase
        .from('quotes')
        .update({ pdf_path: path })
        .eq('id', id);
      if (pdfPathError) throw new Error(pdfPathError.message);

      await logPipelineEvent({
        quoteId: id, contractorId: contractor.id, step: 'pdf_generate',
        status: 'success', detail: { path, regenerated: true },
      });
    } catch (error) {
      await logPipelineEvent({
        quoteId: id, contractorId: contractor.id, step: 'pdf_generate',
        status: 'error', detail: { error: String(error) },
      });
      return NextResponse.json({ error: 'Pdf genereren mislukt. Probeer opnieuw.' }, { status: 500 });
    }
  }

  const { data: signed } = await supabase.storage
    .from('quote-pdfs')
    .createSignedUrl(path, 60 * 10);

  if (!signed) {
    return NextResponse.json({ error: 'Pdf niet beschikbaar' }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
