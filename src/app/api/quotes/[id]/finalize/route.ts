import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { finalizeQuote, type FinalizeDeps } from '@/lib/quotes/finalize';
import { renderQuotePdf } from '@/lib/pdf/render';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { Contractor, Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export const runtime = 'nodejs';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let supabase: Awaited<ReturnType<typeof requireContractor>>['supabase'];
  let contractorId: string;
  try {
    const auth = await requireContractor();
    supabase = auth.supabase;
    contractorId = auth.contractor.id;
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
      const { data, error } = await supabase
        .from('quotes')
        .update({ status: 'final' })
        .eq('id', quoteId)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('quote_status_changed');
    },
    loadContractor: async (contractorId) => {
      const { data } = await supabase.from('contractors').select('*').eq('id', contractorId).single();
      return data as Contractor | null;
    },
    loadParentQuoteNumber: async (parentId) => {
      const { data } = await supabase.from('quotes').select('quote_number').eq('id', parentId).maybeSingle();
      return data?.quote_number ?? null;
    },
    renderPdf: renderQuotePdf,
    uploadPdf: async (path, pdf) => {
      const { error } = await createAdminSupabase().storage
        .from('quote-pdfs').upload(path, pdf, { contentType: 'application/pdf', upsert: false });
      if (error) throw new Error(error.message);
    },
    savePdfPath: async (quoteId, path) => {
      // Once the status is final, commercial RLS intentionally blocks normal
      // client updates. Persisting the server-generated PDF identity is a
      // server-owned operation and remains allowed before acceptance.
      const { error } = await createAdminSupabase().rpc('set_quote_pdf_path', {
        p_quote_id: quoteId,
        p_contractor_id: contractorId,
        p_pdf_path: path,
      });
      if (error) throw new Error(error.message);
    },
    log: logPipelineEvent,
  };

  const result = await finalizeQuote(deps, id);

  if (!result.ok && 'status' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!result.ok) {
    return NextResponse.json({ blockers: result.blockers }, { status: 422 });
  }
  return NextResponse.json({ ok: true });
}
