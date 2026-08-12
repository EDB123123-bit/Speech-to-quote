'use server';

import { revalidatePath } from 'next/cache';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { movePipelineStage } from '@/lib/quotes/pipeline-move';
import { renderQuotePdf } from '@/lib/pdf/render';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import type { MoveTarget } from '@/lib/quotes/stage-move';
import type { Contractor, PipelineStage, Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export async function moveQuoteToStage(
  quoteId: string,
  target: MoveTarget,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await moveQuoteToStageUnsafe(quoteId, target);
  } catch (error) {
    if (error instanceof UnauthorizedError) return { ok: false, error: 'Niet aangemeld' };
    return { ok: false, error: 'Verplaatsen mislukt. Probeer opnieuw.' };
  }
}

async function moveQuoteToStageUnsafe(
  quoteId: string,
  target: MoveTarget,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, contractor } = await requireContractor();

  const result = await movePipelineStage(
    {
      loadQuote: async (id) => {
        const { data } = await supabase.from('quotes').select('*').eq('id', id).single();
        return data as Quote | null;
      },
      loadStage: async (id) => {
        const { data } = await supabase.from('pipeline_stages').select('*').eq('id', id).single();
        return data as PipelineStage | null;
      },
      setStage: async (id, stageId) => {
        const { error } = await supabase
          .from('quotes').update({ pipeline_stage_id: stageId }).eq('id', id);
        if (error) throw new Error('Verplaatsen mislukt. Probeer opnieuw.');
      },
      finalizeDeps: {
        loadQuote: async (id) => {
          const { data } = await supabase.from('quotes').select('*').eq('id', id).single();
          return data as Quote | null;
        },
        loadLineItems: async (id) => {
          const { data } = await supabase.from('quote_line_items').select('*').eq('quote_id', id);
          return (data ?? []) as QuoteLineItem[];
        },
        loadClarifications: async (id) => {
          const { data } = await supabase.from('quote_clarifications').select('*').eq('quote_id', id);
          return (data ?? []) as QuoteClarification[];
        },
        updateStatusToFinal: async (id) => {
          const { error } = await supabase
            .from('quotes').update({ status: 'final' }).eq('id', id).eq('status', 'draft');
          if (error) throw new Error('Afwerken mislukt. Probeer opnieuw.');
        },
        loadContractor: async (id) => {
          const { data } = await supabase.from('contractors').select('*').eq('id', id).single();
          return data as Contractor | null;
        },
        renderPdf: renderQuotePdf,
        uploadPdf: async (path, pdf) => {
          const { error } = await supabase.storage
            .from('quote-pdfs').upload(path, pdf, { contentType: 'application/pdf', upsert: true });
          if (error) throw new Error(error.message);
        },
        savePdfPath: async (id, path) => {
          const { error } = await supabase.from('quotes').update({ pdf_path: path }).eq('id', id);
          if (error) throw new Error(error.message);
        },
        log: logPipelineEvent,
      },
    },
    quoteId,
    target,
    contractor.id,
  );

  if (result.ok) revalidatePath('/pijplijn');
  return result;
}
