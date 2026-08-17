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

  const pdf = await renderQuotePdf({
    contractor: args.contractor,
    quote: args.quote,
    lineItems: (lineItems ?? []) as QuoteLineItem[],
  });
  const path = `${args.contractor.id}/${args.quote.id}.pdf`;

  const { error: uploadError } = await args.supabase.storage
    .from('quote-pdfs')
    .upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await args.supabase
    .from('quotes')
    .update({ pdf_path: path })
    .eq('id', args.quote.id);
  if (updateError) throw new Error(updateError.message);

  await logPipelineEvent({
    quoteId: args.quote.id,
    contractorId: args.contractor.id,
    step: 'pdf_generate',
    status: 'success',
    detail: { path, regenerated: true },
  });

  return { pdf: new Uint8Array(pdf), path };
}
