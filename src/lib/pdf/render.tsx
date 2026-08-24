import { renderToBuffer } from '@react-pdf/renderer';
import QuoteDocument from '@/lib/pdf/QuoteDocument';
import { buildQuoteViewModel } from '@/lib/pdf/quote-view-model';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

export async function renderQuotePdf(args: {
  contractor: Contractor;
  quote: Quote;
  lineItems: QuoteLineItem[];
  originalQuoteNumber?: string | null;
}): Promise<Buffer> {
  const model = buildQuoteViewModel(args);
  return renderToBuffer(<QuoteDocument model={model} />);
}
