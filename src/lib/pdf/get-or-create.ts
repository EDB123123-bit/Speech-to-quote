import type { SupabaseClient } from '@supabase/supabase-js';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import { renderQuotePdf } from '@/lib/pdf/render';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

export async function getOrCreateQuotePdf(args: {
  supabase: SupabaseClient;
  contractor: Contractor;
  quote: Quote;
}): Promise<{ pdf: Uint8Array; path: string }> {
  if (args.quote.pdf_path) {
    const { data } = await args.supabase.storage
      .from('quote-pdfs')
      .download(args.quote.pdf_path);

    if (data) {
      return {
        pdf: new Uint8Array(await data.arrayBuffer()),
        path: args.quote.pdf_path,
      };
    }
  }

  const { data: lineItems, error: lineItemsError } = await args.supabase
    .from('quote_line_items')
    .select('*')
    .eq('quote_id', args.quote.id);
  if (lineItemsError) throw new Error(lineItemsError.message);
  let originalQuoteNumber: string | null = null;
  if (args.quote.parent_quote_id) {
    const { data: parent } = await args.supabase.from('quotes').select('quote_number').eq('id', args.quote.parent_quote_id).maybeSingle();
    originalQuoteNumber = parent?.quote_number ?? null;
  }

  const pdf = await renderQuotePdf({
    contractor: args.contractor,
    quote: args.quote,
    lineItems: (lineItems ?? []) as QuoteLineItem[],
    originalQuoteNumber,
  });
  const path = `${args.contractor.id}/${args.quote.id}.pdf`;

  const { error: uploadError } = await args.supabase.storage
    .from('quote-pdfs')
    .upload(path, pdf, { contentType: 'application/pdf', upsert: false });
  let storedPdf = new Uint8Array(pdf);
  if (uploadError) {
    // A previous finalization may have stored the immutable object before its
    // DB path was recorded. Reuse it; never overwrite a finalized artifact.
    const existing = await args.supabase.storage.from('quote-pdfs').download(path);
    if (existing.error || !existing.data) throw new Error(uploadError.message);
    storedPdf = new Uint8Array(await existing.data.arrayBuffer());
  }

  const { error: updateError } = await args.supabase
    .rpc('set_quote_pdf_path', {
      p_quote_id: args.quote.id,
      p_contractor_id: args.contractor.id,
      p_pdf_path: path,
    });
  if (updateError) throw new Error(updateError.message);

  await logPipelineEvent({
    quoteId: args.quote.id,
    contractorId: args.contractor.id,
    step: 'pdf_generate',
    status: 'success',
    detail: { path, regenerated: true },
  });

  return { pdf: storedPdf, path };
}
