export const VAT_RATES = [0.06, 0.21] as const;
export type VatRate = (typeof VAT_RATES)[number];
export const INVOICE_VAT_RATES = [0, 0.06, 0.21] as const;
export type InvoiceVatRate = (typeof INVOICE_VAT_RATES)[number];

export function isVatRate(value: unknown): value is VatRate {
  return VAT_RATES.includes(value as VatRate);
}

export type LineType = 'materials' | 'labor' | 'combined';
export type QuoteVatRate = InvoiceVatRate;
export type QuoteVatCategory = 'S' | 'AE';
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

export type InvoiceDocumentType = 'invoice' | 'credit_note';
export type InvoiceStatus = 'draft' | 'issued' | 'credited';
export type InvoiceCustomerType = 'private' | 'business';
export type InvoiceVatTreatment = 'standard' | 'reverse_charge';
export type InvoiceDeliveryChannel = 'email' | 'peppol_manual' | 'peppol_api';
export type InvoiceDocumentStatus = 'pending' | 'ready' | 'failed';
export type InvoiceTransportStatus = 'not_sent' | 'ready' | 'queued' | 'submitted' | 'delivered' | 'failed';
export type InvoiceBusinessResponseStatus = 'received' | 'accepted' | 'conditionally_accepted' | 'rejected' | 'processing' | 'paid' | 'information_required';
export type InvoiceStatusSource = 'user' | 'provider' | 'system';
export type InvoiceDeliveryStatus =
  | 'not_sent'
  | 'ready_for_upload'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'sent';
export type InvoiceVatCategory = 'S' | 'AE';

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
  legal_form?: string | null;
  rpr?: string | null;
  registration_number?: string | null;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
  country_code?: string;
  email?: string | null;
  iban?: string | null;
  invoice_prefix?: string;
  default_payment_term_days?: number;
  deactivated_at?: string | null;
  onboarding_completed_at: string | null;
  created_at: string;
};

export type CatalogItem = {
  id: string;
  contractor_id: string;
  name: string;
  unit: string;
  pricing_mode?: 'split' | 'combined';
  materials_price_cents: number | null;
  labor_price_cents: number | null;
  combined_price_cents?: number | null;
  vat_rate: VatRate;
  unit_code?: string | null;
  created_at: string;
};

export type PipelineStage = {
  id: string;
  contractor_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type Quote = {
  id: string;
  contractor_id: string;
  transcript: string | null;
  status: QuoteStatus;
  source?: 'voice' | 'pdf_import';
  quote_number?: string;
  issue_date?: string;
  valid_until?: string | null;
  order_reference?: string | null;
  customer_name: string | null;
  customer_address: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  audio_path: string | null;
  audio_deleted_at: string | null;
  pdf_path: string | null;
  pipeline_stage_id: string | null;
  created_at: string;
};

export type QuoteLineItem = {
  id: string;
  quote_id: string;
  catalog_item_id: string | null;
  description: string;
  source_notes?: string | null;
  quantity: number;
  unit: string;
  unit_code?: string | null;
  unit_price_cents: number | null;
  vat_rate: QuoteVatRate | null;
  vat_category?: QuoteVatCategory;
  line_type: LineType;
  sort_order: number;
  created_at: string;
};

export type QuoteImportDocumentStatus =
  | 'uploaded'
  | 'processing'
  | 'ready_for_review'
  | 'importing'
  | 'imported'
  | 'duplicate'
  | 'unsupported'
  | 'failed';

export type QuoteImportIdentityMode = 'preserve_source' | 'new_identity';
export type QuoteImportProcessingMode = 'interactive' | 'provider_batch';

export type QuoteImportBatch = {
  id: string;
  contractor_id: string;
  requested_quote_count: number;
  processing_mode: QuoteImportProcessingMode;
  status: 'active' | 'completed' | 'failed';
  file_count: number;
  total_bytes: number;
  profile_suggestion: Record<string, unknown> | null;
  profile_suggestion_status: 'pending' | 'accepted' | 'rejected' | 'unavailable';
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type QuoteImportDocument = {
  id: string;
  batch_id: string;
  contractor_id: string;
  original_filename: string;
  sha256: string;
  semantic_hash: string | null;
  file_size_bytes: number;
  page_count: number | null;
  storage_path: string | null;
  source_deleted_at: string | null;
  cleanup_status: 'not_applicable' | 'pending' | 'deleted' | 'failed';
  status: QuoteImportDocumentStatus;
  duplicate_of: string | null;
  locked_until: string | null;
  attempts: number;
  extraction_model: string | null;
  extraction_schema_version: string | null;
  extracted_payload: Record<string, unknown> | null;
  reviewed_payload: Record<string, unknown> | null;
  validation_result: Record<string, unknown> | null;
  identity_mode: QuoteImportIdentityMode | null;
  warnings_acknowledged: boolean;
  rounding_override_reason: string | null;
  quote_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  processing_duration_ms: number | null;
  provider_batch_id: string | null;
  provider_batch_status: 'submitting' | 'in_progress' | 'canceling' | 'ended' | null;
  provider_batch_expires_at: string | null;
  provider_batch_ended_at: string | null;
  provider_result_status: 'succeeded' | 'errored' | 'canceled' | 'expired' | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type CatalogPriceSuggestion = {
  id: string;
  contractor_id: string;
  normalized_description: string;
  suggested_name: string;
  unit: string;
  unit_code: string;
  vat_rate: VatRate;
  latest_price_cents: number;
  minimum_price_cents: number;
  maximum_price_cents: number;
  observation_count: number;
  source_quote_ids: string[];
  latest_source_date: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  accepted_catalog_item_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  contractor_id: string;
  quote_id: string | null;
  document_type: InvoiceDocumentType;
  original_invoice_id: string | null;
  original_invoice_number: string | null;
  status: InvoiceStatus;
  customer_type: InvoiceCustomerType;
  customer_name: string;
  customer_address: string;
  customer_street: string | null;
  customer_postal_code: string | null;
  customer_city: string | null;
  customer_country_code: string;
  customer_email: string | null;
  customer_phone: string | null;
  customer_vat_number: string | null;
  customer_enterprise_number: string | null;
  customer_peppol_id: string | null;
  seller_snapshot: Record<string, unknown>;
  buyer_snapshot: Record<string, unknown>;
  invoice_number: string | null;
  issue_date: string | null;
  delivery_date: string | null;
  due_date: string | null;
  currency: 'EUR';
  buyer_reference: string;
  vat_treatment: InvoiceVatTreatment;
  reverse_charge_confirmed: boolean;
  reduced_vat_confirmed: boolean;
  reduced_vat_declaration: string | null;
  reduced_vat_declaration_version: string | null;
  subtotal_cents: number;
  vat_total_cents: number;
  total_cents: number;
  delivery_channel: InvoiceDeliveryChannel;
  delivery_status: InvoiceDeliveryStatus;
  transport_status: InvoiceTransportStatus;
  business_response_status: InvoiceBusinessResponseStatus | null;
  delivery_status_source: InvoiceStatusSource;
  delivery_submitted_at: string | null;
  delivery_external_reference: string | null;
  delivery_receipt_path: string | null;
  delivery_receipt_sha256: string | null;
  paid_at: string | null;
  pdf_path: string | null;
  ubl_path: string | null;
  pdf_sha256: string | null;
  ubl_sha256: string | null;
  document_status: InvoiceDocumentStatus;
  document_error: string | null;
  peppol_validation_release: string | null;
  retain_until: string | null;
  issued_at: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceLineItem = {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit: string;
  unit_code: string;
  unit_price_cents: number;
  vat_rate: InvoiceVatRate;
  vat_category: InvoiceVatCategory;
  line_total_cents: number;
  sort_order: number;
  created_at: string;
};

export type InvoiceEvent = {
  id: string;
  invoice_id: string;
  contractor_id: string;
  event_type: string;
  detail: Record<string, unknown>;
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
