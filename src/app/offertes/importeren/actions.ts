'use server';

import { revalidatePath } from 'next/cache';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { requireContractor } from '@/lib/auth/require-contractor';
import { quoteImportEnabled } from '@/lib/quote-imports/constants';
import { ApprovableQuotePayloadSchema } from '@/lib/quote-imports/schema';
import { validateReviewedTotals } from '@/lib/quote-imports/validation';
import type {
  CatalogPriceSuggestion,
  Quote,
  QuoteImportBatch,
  QuoteImportDocument,
  QuoteImportIdentityMode,
} from '@/lib/supabase/types';

function assertEnabled(): void {
  if (!quoteImportEnabled()) throw new Error('Pdf-import is nog niet ingeschakeld.');
}

export async function createQuoteImportBatch(requestedQuoteCount: number): Promise<QuoteImportBatch> {
  assertEnabled();
  if (!Number.isInteger(requestedQuoteCount) || requestedQuoteCount < 1 || requestedQuoteCount > 25) {
    throw new Error('Kies een aantal tussen 1 en 25.');
  }
  const { supabase } = await requireContractor();
  const { data, error } = await supabase.rpc('create_quote_import_batch', {
    p_requested_quote_count: requestedQuoteCount,
  });
  if (error || !data) throw new Error('De importbatch kon niet worden aangemaakt.');
  return data as QuoteImportBatch;
}

export async function registerUploadedQuote(input: {
  batchId: string;
  originalFilename: string;
  storagePath: string;
  sha256: string;
  fileSizeBytes: number;
}): Promise<QuoteImportDocument> {
  assertEnabled();
  const { supabase } = await requireContractor();
  const { data, error } = await supabase.rpc('register_quote_import_document', {
    p_batch_id: input.batchId,
    p_original_filename: input.originalFilename,
    p_storage_path: input.storagePath,
    p_sha256: input.sha256,
    p_file_size_bytes: input.fileSizeBytes,
  });
  if (error || !data) throw new Error('De geüploade pdf kon niet worden geregistreerd.');
  const document = data as QuoteImportDocument;
  if (document.status === 'duplicate' && document.storage_path) {
    const admin = createAdminSupabase();
    const { error: removeError } = await admin.storage.from('quote-imports').remove([document.storage_path]);
    await admin.rpc('record_quote_import_source_deleted', {
      p_document_id: document.id,
      p_success: !removeError,
      p_error_message: removeError?.message ?? null,
    });
  }
  revalidatePath(`/offertes/importeren/${input.batchId}`);
  return document;
}

export async function discardUnregisteredUpload(input: { batchId: string; storagePath: string }): Promise<void> {
  assertEnabled();
  const { contractor } = await requireContractor();
  const expectedPrefix = `${contractor.id}/${input.batchId}/`;
  if (!input.storagePath.startsWith(expectedPrefix)) throw new Error('Ongeldig uploadpad.');
  const admin = createAdminSupabase();
  await admin.storage.from('quote-imports').remove([input.storagePath]);
}

export async function approveQuoteImport(input: {
  documentId: string;
  batchId: string;
  payload: unknown;
  identityMode: QuoteImportIdentityMode;
  warningsAcknowledged: boolean;
  roundingOverrideReason: string | null;
}): Promise<Quote> {
  assertEnabled();
  const payload = ApprovableQuotePayloadSchema.parse(input.payload);
  const reviewValidation = validateReviewedTotals(payload);
  if (reviewValidation.mismatches.length > 0 && (!input.warningsAcknowledged || !input.roundingOverrideReason?.trim())) {
    throw new Error('Bevestig het verschil met de brontotalen en noteer de reden.');
  }
  const { supabase } = await requireContractor();
  const { data: saved, error: saveError } = await supabase.rpc('save_quote_import_review', {
    p_document_id: input.documentId,
    p_reviewed_payload: payload,
    p_identity_mode: input.identityMode,
    p_warnings_acknowledged: input.warningsAcknowledged,
    p_rounding_override_reason: input.roundingOverrideReason,
  });
  if (saveError || !saved) throw new Error('De nagekeken offerte kon niet worden opgeslagen.');
  const { data, error } = await supabase.rpc('approve_quote_import_document', {
    p_document_id: input.documentId,
  });
  if (error || !data) {
    if (error?.message.includes('duplicate_quote_number')) throw new Error('Dit offertenummer bestaat al. Kies een nieuwe identiteit.');
    throw new Error('De offerte kon niet worden geïmporteerd. Controleer alle velden.');
  }

  const document = saved as QuoteImportDocument;
  if (document.storage_path) {
    const admin = createAdminSupabase();
    const { error: removeError } = await admin.storage.from('quote-imports').remove([document.storage_path]);
    await admin.rpc('record_quote_import_source_deleted', {
      p_document_id: input.documentId,
      p_success: !removeError,
      p_error_message: removeError?.message ?? null,
    });
  }
  revalidatePath(`/offertes/importeren/${input.batchId}`);
  revalidatePath('/offertes');
  revalidatePath('/instellingen');
  return data as Quote;
}

export async function reviewProfileSuggestion(input: {
  batchId: string;
  accept: boolean;
  profile: Record<string, unknown> | null;
}): Promise<void> {
  assertEnabled();
  const { supabase } = await requireContractor();
  const { error } = await supabase.rpc('review_quote_import_profile_suggestion', {
    p_batch_id: input.batchId,
    p_accept: input.accept,
    p_profile: input.profile,
  });
  if (error) throw new Error('De bedrijfsgegevens konden niet worden bijgewerkt.');
  revalidatePath(`/offertes/importeren/${input.batchId}`);
  revalidatePath('/instellingen');
}

export async function reviewCatalogSuggestion(input: {
  suggestionId: string;
  accept: boolean;
  values: Record<string, unknown> | null;
}): Promise<CatalogPriceSuggestion> {
  assertEnabled();
  const { supabase } = await requireContractor();
  const { data, error } = await supabase.rpc('review_catalog_price_suggestion', {
    p_suggestion_id: input.suggestionId,
    p_accept: input.accept,
    p_input: input.values,
  });
  if (error || !data) throw new Error('De prijssuggestie kon niet worden verwerkt.');
  revalidatePath('/instellingen');
  return data as CatalogPriceSuggestion;
}
