import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { renderQuotePdf } from '@/lib/pdf/render';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import { createAdminSupabase } from '@/lib/supabase/admin';
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

  // Only finalized/sent/accepted quotes may ever be downloaded here. Rendering a draft
  // would persist its (possibly unpriced) PDF as pdf_path, which a later
  // finalize whose own PDF step fails would then serve as if it were final.
  if (!['final', 'sent', 'accepted'].includes((quote as Quote).status)) {
    return NextResponse.json({ error: 'Deze offerte is nog niet afgewerkt.' }, { status: 409 });
  }

  let path = (quote as Quote).pdf_path;

  // Regenerate on demand when finalizing produced no PDF.
  if (!path) {
    try {
      const { data: lineItems } = await supabase
        .from('quote_line_items').select('*').eq('quote_id', id);
      const { data: parent } = (quote as Quote).parent_quote_id
        ? await supabase.from('quotes').select('quote_number').eq('id', (quote as Quote).parent_quote_id as string).maybeSingle()
        : { data: null };

      const pdf = await renderQuotePdf({
        contractor,
        quote: quote as Quote,
        lineItems: (lineItems ?? []) as QuoteLineItem[],
        originalQuoteNumber: parent?.quote_number ?? null,
      });

      path = `${contractor.id}/${id}.pdf`;
      const admin = createAdminSupabase();
      const { error: uploadError } = await admin.storage
        .from('quote-pdfs')
        .upload(path, pdf, { contentType: 'application/pdf', upsert: false });
      if (uploadError) {
        const existing = await admin.storage.from('quote-pdfs').download(path);
        if (existing.error || !existing.data) throw new Error(uploadError.message);
      }

      const { error: pdfPathError } = await admin
        .rpc('set_quote_pdf_path', {
          p_quote_id: id,
          p_contractor_id: contractor.id,
          p_pdf_path: path,
        });
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
