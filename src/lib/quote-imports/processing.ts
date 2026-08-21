import 'server-only';
import { createHash } from 'node:crypto';
import type { MessageBatchIndividualResponse } from '@anthropic-ai/sdk/resources/messages/batches';
import { getAnthropic } from '@/lib/ai/anthropic-client';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { QuoteImportDocument } from '@/lib/supabase/types';
import {
  buildQuoteExtractionParams,
  extractQuoteWithModelCascade,
  parseQuoteExtractionMessage,
} from './anthropic-extractor';
import { QUOTE_IMPORT_SCHEMA_VERSION, quoteImportBatchModel } from './constants';
import type { QuoteExtractionResult } from './extractor';
import { inspectPdf, UnsupportedPdfError } from './pdf';
import { dominantSellerSuggestion } from './profile';
import { toReviewedQuotePayload, validateExtractedQuote } from './validation';

type ProcessingOutcome = {
  documentId: string;
  status: QuoteImportDocument['status'];
};

async function loadVerifiedPdf(document: QuoteImportDocument): Promise<{ pdf: Uint8Array; pageCount: number }> {
  if (!document.storage_path) throw new UnsupportedPdfError('source_missing', 'Het bronbestand ontbreekt.');
  const admin = createAdminSupabase();
  const { data: blob, error } = await admin.storage.from('quote-imports').download(document.storage_path);
  if (error || !blob) throw new Error('source_download_failed');
  const pdf = new Uint8Array(await blob.arrayBuffer());
  const hash = createHash('sha256').update(pdf).digest('hex');
  if (hash !== document.sha256) {
    throw new UnsupportedPdfError('hash_mismatch', 'De geüploade pdf is gewijzigd of beschadigd.');
  }
  const { pageCount } = await inspectPdf(pdf);
  return { pdf, pageCount };
}

async function updateProfileSuggestion(batchId: string, contractorId: string): Promise<void> {
  const admin = createAdminSupabase();
  const { data } = await admin.from('quote_import_documents')
    .select('extracted_payload')
    .eq('batch_id', batchId)
    .not('extracted_payload', 'is', null);
  const suggestion = dominantSellerSuggestion((data ?? []).map((item) => item.extracted_payload));
  await admin.rpc('set_quote_import_profile_suggestion', {
    p_batch_id: batchId,
    p_contractor_id: contractorId,
    p_suggestion: suggestion,
  });
}

async function deleteDuplicateSource(document: QuoteImportDocument): Promise<void> {
  if (document.status !== 'duplicate' || !document.storage_path) return;
  const admin = createAdminSupabase();
  const { error } = await admin.storage.from('quote-imports').remove([document.storage_path]);
  await admin.rpc('record_quote_import_source_deleted', {
    p_document_id: document.id,
    p_success: !error,
    p_error_message: error?.message ?? null,
  });
}

async function recordExtraction(
  document: QuoteImportDocument,
  contractorId: string,
  pageCount: number,
  extraction: QuoteExtractionResult,
): Promise<ProcessingOutcome> {
  const admin = createAdminSupabase();
  const validation = validateExtractedQuote(extraction.document);
  const reviewedPayload = toReviewedQuotePayload(extraction.document);
  const semanticHash = createHash('sha256').update(JSON.stringify({
    customer: reviewedPayload.customer,
    quote: reviewedPayload.quote,
    lines: reviewedPayload.lines,
    totals: reviewedPayload.sourceTotals,
  })).digest('hex');
  const status = validation.supported ? 'ready_for_review' : 'unsupported';
  const { data, error } = await admin.rpc('record_quote_import_result', {
    p_document_id: document.id,
    p_contractor_id: contractorId,
    p_status: status,
    p_page_count: pageCount,
    p_extraction_model: extraction.model,
    p_schema_version: QUOTE_IMPORT_SCHEMA_VERSION,
    p_extracted_payload: extraction.document,
    p_reviewed_payload: status === 'ready_for_review' ? reviewedPayload : null,
    p_validation_result: validation,
    p_semantic_hash: semanticHash,
    p_input_tokens: extraction.inputTokens,
    p_output_tokens: extraction.outputTokens,
    p_duration_ms: extraction.durationMs,
    p_error_code: status === 'unsupported' ? validation.issues[0]?.code ?? 'unsupported' : null,
    p_error_message: status === 'unsupported' ? validation.issues[0]?.messageNl ?? 'Niet ondersteund.' : null,
  });
  if (error || !data) throw new Error('result_write_failed');
  const recorded = data as QuoteImportDocument;
  await deleteDuplicateSource(recorded);
  await updateProfileSuggestion(document.batch_id, contractorId);
  return { documentId: document.id, status: recorded.status };
}

export async function recordQuoteImportFailure(args: {
  documentId: string;
  contractorId: string;
  pageCount: number | null;
  status: 'unsupported' | 'failed';
  code: string;
  message: string;
  model?: string;
}): Promise<ProcessingOutcome> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc('record_quote_import_result', {
    p_document_id: args.documentId,
    p_contractor_id: args.contractorId,
    p_status: args.status,
    p_page_count: args.pageCount,
    p_extraction_model: args.model ?? 'not_started',
    p_schema_version: QUOTE_IMPORT_SCHEMA_VERSION,
    p_extracted_payload: null,
    p_reviewed_payload: null,
    p_validation_result: {
      supported: false,
      issues: [{ code: args.code, severity: 'error', messageNl: args.message, path: '$' }],
    },
    p_semantic_hash: null,
    p_input_tokens: null,
    p_output_tokens: null,
    p_duration_ms: null,
    p_error_code: args.code,
    p_error_message: args.message,
  });
  if (error || !data) throw new Error('result_write_failed');
  return { documentId: args.documentId, status: (data as QuoteImportDocument | null)?.status ?? args.status };
}

export async function processInteractiveQuoteImport(
  documentId: string,
  contractorId: string,
): Promise<ProcessingOutcome> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc('claim_quote_import_document', {
    p_document_id: documentId,
    p_contractor_id: contractorId,
  });
  if (error || !data) throw new Error('document_not_claimable');
  const document = data as QuoteImportDocument;
  let pageCount: number | null = null;
  try {
    const source = await loadVerifiedPdf(document);
    pageCount = source.pageCount;
    const extraction = await extractQuoteWithModelCascade({
      pdf: source.pdf,
      filename: document.original_filename,
    });
    return await recordExtraction(document, contractorId, pageCount, extraction);
  } catch (error) {
    const unsupported = error instanceof UnsupportedPdfError;
    return recordQuoteImportFailure({
      documentId,
      contractorId,
      pageCount,
      status: unsupported ? 'unsupported' : 'failed',
      code: unsupported ? error.code : 'extraction_failed',
      message: unsupported ? error.message : 'De pdf kon niet worden verwerkt. Probeer opnieuw.',
    });
  }
}

async function claimProviderDocument(documentId: string, contractorId: string): Promise<QuoteImportDocument> {
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc('claim_quote_import_provider_document', {
    p_document_id: documentId,
    p_contractor_id: contractorId,
  });
  if (error || !data) throw new Error('provider_document_not_claimable');
  return data as QuoteImportDocument;
}

export async function submitProviderQuoteImport(
  documentId: string,
  contractorId: string,
): Promise<ProcessingOutcome> {
  const document = await claimProviderDocument(documentId, contractorId);
  let pageCount: number | null = null;
  const model = quoteImportBatchModel();
  try {
    const source = await loadVerifiedPdf(document);
    pageCount = source.pageCount;
    const batch = await getAnthropic().messages.batches.create({
      requests: [{
        custom_id: document.id,
        params: buildQuoteExtractionParams({
          pdf: source.pdf,
          filename: document.original_filename,
          model,
        }),
      }],
    });
    const admin = createAdminSupabase();
    const { error } = await admin.rpc('record_quote_import_provider_batch', {
      p_document_id: document.id,
      p_contractor_id: contractorId,
      p_provider_batch_id: batch.id,
      p_provider_status: batch.processing_status,
      p_expires_at: batch.expires_at,
      p_page_count: pageCount,
      p_extraction_model: model,
      p_schema_version: QUOTE_IMPORT_SCHEMA_VERSION,
    });
    if (error) {
      const { data: recorded } = await admin.from('quote_import_documents')
        .select('provider_batch_id')
        .eq('id', document.id)
        .eq('contractor_id', contractorId)
        .maybeSingle();
      if (recorded?.provider_batch_id === batch.id) return { documentId, status: 'processing' };
      throw new Error('provider_batch_record_failed');
    }
    return { documentId, status: 'processing' };
  } catch (error) {
    const unsupported = error instanceof UnsupportedPdfError;
    return recordQuoteImportFailure({
      documentId,
      contractorId,
      pageCount,
      status: unsupported ? 'unsupported' : 'failed',
      code: unsupported ? error.code : 'provider_batch_submission_failed',
      message: unsupported
        ? error.message
        : 'De batchverwerking kon niet worden gestart. Probeer dit document opnieuw.',
      model,
    });
  }
}

async function providerResultFor(
  providerBatchId: string,
  documentId: string,
): Promise<MessageBatchIndividualResponse | null> {
  const decoder = await getAnthropic().messages.batches.results(providerBatchId);
  for await (const item of decoder) {
    if (item.custom_id === documentId) return item;
  }
  return null;
}

export async function pollProviderQuoteImport(
  document: QuoteImportDocument,
  contractorId: string,
): Promise<ProcessingOutcome> {
  if (!document.provider_batch_id || document.status !== 'processing') {
    return { documentId: document.id, status: document.status };
  }
  const admin = createAdminSupabase();
  const batch = await getAnthropic().messages.batches.retrieve(document.provider_batch_id);
  if (batch.processing_status !== 'ended') {
    await admin.rpc('record_quote_import_provider_batch_status', {
      p_document_id: document.id,
      p_contractor_id: contractorId,
      p_provider_status: batch.processing_status,
      p_ended_at: null,
      p_result_status: null,
    });
    return { documentId: document.id, status: 'processing' };
  }

  const result = await providerResultFor(document.provider_batch_id, document.id);
  const resultType = result?.result.type ?? 'errored';
  await admin.rpc('record_quote_import_provider_batch_status', {
    p_document_id: document.id,
    p_contractor_id: contractorId,
    p_provider_status: 'ended',
    p_ended_at: batch.ended_at,
    p_result_status: resultType,
  });
  if (!result || result.result.type !== 'succeeded') {
    const label = result?.result.type === 'expired'
      ? 'De batchverwerking duurde langer dan 24 uur. Probeer dit document opnieuw.'
      : 'De batchverwerking van dit document is mislukt. Probeer opnieuw.';
    return recordQuoteImportFailure({
      documentId: document.id,
      contractorId,
      pageCount: document.page_count,
      status: 'failed',
      code: `provider_batch_${result?.result.type ?? 'missing_result'}`,
      message: label,
      model: document.extraction_model ?? quoteImportBatchModel(),
    });
  }

  try {
    const extracted = parseQuoteExtractionMessage(result.result.message);
    const createdAt = new Date(batch.created_at).getTime();
    const endedAt = batch.ended_at ? new Date(batch.ended_at).getTime() : Date.now();
    return recordExtraction(document, contractorId, document.page_count ?? 1, {
      document: extracted,
      model: result.result.message.model,
      inputTokens: result.result.message.usage.input_tokens,
      outputTokens: result.result.message.usage.output_tokens,
      durationMs: Math.max(0, endedAt - createdAt),
    });
  } catch {
    return recordQuoteImportFailure({
      documentId: document.id,
      contractorId,
      pageCount: document.page_count,
      status: 'failed',
      code: 'provider_batch_invalid_output',
      message: 'De batch gaf geen bruikbaar resultaat terug. Probeer dit document opnieuw.',
      model: document.extraction_model ?? quoteImportBatchModel(),
    });
  }
}
