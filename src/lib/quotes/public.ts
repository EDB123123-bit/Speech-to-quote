import { createAdminSupabase } from '@/lib/supabase/admin';
import { hashAcceptanceToken } from '@/lib/quotes/acceptance-token';
import type { Contractor, Quote, QuoteLineItem } from '@/lib/supabase/types';

export type PublicQuote = {
  quote: Pick<Quote, 'id' | 'status' | 'customer_name' | 'customer_address' | 'customer_email' | 'customer_phone' | 'quote_number' | 'issue_date' | 'valid_until' | 'order_reference' | 'created_at' | 'quote_kind' | 'parent_quote_id'>;
  originalQuoteNumber: string | null;
  contractor: Pick<Contractor, 'company_name' | 'address' | 'vat_number' | 'phone'>;
  lineItems: Pick<QuoteLineItem, 'id' | 'description' | 'quantity' | 'unit' | 'unit_price_cents' | 'vat_rate' | 'vat_category' | 'line_type' | 'line_kind' | 'classification' | 'sort_order'>[];
};

export async function loadPublicQuote(token: string): Promise<PublicQuote | null> {
  const admin = createAdminSupabase();
  const tokenHash = hashAcceptanceToken(token);
  const { data: tokenRow, error: tokenError } = await admin
    .from('quote_acceptance_tokens')
    .select('quote_id')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (tokenError || !tokenRow) return null;

  const [{ data: quote }, { data: lineItems }] = await Promise.all([
    admin
      .from('quotes')
      .select('id,status,customer_name,customer_address,customer_email,customer_phone,quote_number,issue_date,valid_until,order_reference,created_at,contractor_id,quote_kind,parent_quote_id')
      .eq('id', tokenRow.quote_id)
      .in('status', ['sent', 'accepted'])
      .maybeSingle(),
    admin
      .from('quote_line_items')
      .select('id,description,quantity,unit,unit_price_cents,vat_rate,vat_category,line_type,line_kind,classification,sort_order')
      .eq('quote_id', tokenRow.quote_id)
      .order('sort_order'),
  ]);

  if (!quote) return null;
  const { data: contractor } = await admin
    .from('contractors')
    .select('company_name,address,vat_number,phone')
    .eq('id', quote.contractor_id)
    .single();
  if (!contractor) return null;
  const { data: parent } = quote.parent_quote_id
    ? await admin.from('quotes').select('quote_number').eq('id', quote.parent_quote_id).maybeSingle()
    : { data: null };

  const safeQuote = { ...(quote as Quote & { contractor_id: string }) } as Record<string, unknown>;
  delete safeQuote.contractor_id;
  return {
    quote: safeQuote as PublicQuote['quote'],
    originalQuoteNumber: parent?.quote_number ?? null,
    contractor: contractor as PublicQuote['contractor'],
    lineItems: (lineItems ?? []) as PublicQuote['lineItems'],
  };
}
