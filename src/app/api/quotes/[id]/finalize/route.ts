import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { finalizeQuote, type FinalizeDeps } from '@/lib/quotes/finalize';
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

  const deps: FinalizeDeps = {
    loadQuote: async (quoteId) => {
      const { data } = await supabase.from('quotes').select('*').eq('id', quoteId).single();
      return data as Quote | null;
    },
    loadLineItems: async (quoteId) => {
      const { data } = await supabase.from('quote_line_items').select('*').eq('quote_id', quoteId);
      return (data ?? []) as QuoteLineItem[];
    },
    loadClarifications: async (quoteId) => {
      const { data } = await supabase.from('quote_clarifications').select('*').eq('quote_id', quoteId);
      return (data ?? []) as QuoteClarification[];
    },
    updateStatusToFinal: async (quoteId) => {
      const { error } = await supabase
        .from('quotes').update({ status: 'final' }).eq('id', quoteId).eq('status', 'draft');
      if (error) throw new Error('Afwerken mislukt. Probeer opnieuw.');
    },
    loadContractor: async (contractorId) => {
      const { data } = await supabase.from('contractors').select('*').eq('id', contractorId).single();
      return data as Contractor | null;
    },
    renderPdf: renderQuotePdf,
    uploadPdf: async (path, pdf) => {
      const { error } = await supabase.storage
        .from('quote-pdfs').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
      if (error) throw new Error(error.message);
    },
    savePdfPath: async (quoteId, path) => {
      const { error } = await supabase.from('quotes').update({ pdf_path: path }).eq('id', quoteId);
      if (error) throw new Error(error.message);
    },
    log: logPipelineEvent,
  };

  const result = await finalizeQuote(deps, id);

  if (!result.ok && 'error' in result) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  if (!result.ok) {
    return NextResponse.json({ blockers: result.blockers }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
