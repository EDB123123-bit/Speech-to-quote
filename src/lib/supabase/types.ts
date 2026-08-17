export const VAT_RATES = [0.06, 0.21] as const;
export type VatRate = (typeof VAT_RATES)[number];

export function isVatRate(value: unknown): value is VatRate {
  return VAT_RATES.includes(value as VatRate);
}

export type LineType = 'materials' | 'labor';
export type QuoteStatus = 'draft' | 'final';
export type ClarificationStatus = 'pending' | 'resolved' | 'dismissed';
export type PipelineStep =
  | 'upload'
  | 'transcribe'
  | 'extract'
  | 'clarification_answer'
  | 'tts_generate'
  | 'pdf_generate'
  | 'audio_cleanup'
  | 'email_send';

export type MailboxProvider = 'gmail' | 'outlook';
export type MailboxStatus = 'connected' | 'disconnected';

export type MailboxConnection = {
  id: string;
  user_id: string;
  provider: MailboxProvider;
  access_token: string;
  refresh_token: string;
  email_address: string;
  token_expires_at: string;
  status: MailboxStatus;
  connected_at: string;
  updated_at: string;
};

export type MailboxSummary = Pick<
  MailboxConnection,
  'provider' | 'email_address' | 'status' | 'connected_at'
>;

export type Contractor = {
  id: string;
  company_name: string;
  address: string | null;
  vat_number: string | null;
  phone: string | null;
  created_at: string;
};

export type CatalogItem = {
  id: string;
  contractor_id: string;
  name: string;
  unit: string;
  materials_price_cents: number;
  labor_price_cents: number;
  vat_rate: VatRate;
  created_at: string;
};

export type Quote = {
  id: string;
  contractor_id: string;
  transcript: string | null;
  status: QuoteStatus;
  customer_name: string | null;
  customer_address: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  audio_path: string | null;
  audio_deleted_at: string | null;
  pdf_path: string | null;
  created_at: string;
};

export type QuoteLineItem = {
  id: string;
  quote_id: string;
  catalog_item_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_price_cents: number | null;
  vat_rate: VatRate | null;
  line_type: LineType;
  sort_order: number;
  created_at: string;
};

export type QuoteClarification = {
  id: string;
  quote_id: string;
  question_nl: string;
  status: ClarificationStatus;
  retry_count: number;
  created_at: string;
};

export type PipelineEvent = {
  id: string;
  quote_id: string | null;
  contractor_id: string;
  step: PipelineStep;
  status: 'success' | 'error';
  detail: Record<string, unknown>;
  created_at: string;
};
