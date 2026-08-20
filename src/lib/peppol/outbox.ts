import { createHash, timingSafeEqual } from 'node:crypto';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { decryptPeppolCredentials } from './crypto';
import { getPeppolConnector, peppolApiEnabled } from './registry';
import type { PeppolSubmissionResult } from './types';

type ClaimedSubmission = {
  id: string; invoice_id: string; connection_id: string; provider_key: string;
  idempotency_key: string; ubl_sha256: string; attempts: number;
  processing_operation: 'submit' | 'poll'; external_submission_id: string | null;
};

async function finish(submissionId: string, result: PeppolSubmissionResult) {
  const admin = createAdminSupabase();
  const status = result.retryable ? 'retry' : result.transportStatus;
  const { error } = await admin.rpc('finish_peppol_submission', {
    p_submission_id: submissionId,
    p_status: status,
    p_external_submission_id: result.externalSubmissionId || null,
    p_business_response_status: result.businessResponseStatus ?? null,
    p_retry_after_seconds: result.retryable ? 60 : null,
    p_error_code: result.errorCode ?? null,
    p_error_message: result.errorMessage ?? null,
  });
  if (error) throw error;
}

async function processSubmission(submission: ClaimedSubmission): Promise<void> {
  const admin = createAdminSupabase();
  const [{ data: invoice }, { data: secret }] = await Promise.all([
    admin.from('invoices').select('ubl_path,customer_peppol_id').eq('id', submission.invoice_id).single(),
    admin.from('peppol_connection_secrets').select('ciphertext,iv,auth_tag,key_version').eq('connection_id', submission.connection_id).single(),
  ]);
  if (!invoice?.ubl_path || !invoice.customer_peppol_id || !secret) throw new Error('submission_material_missing');
  const downloaded = await admin.storage.from('invoice-documents').download(invoice.ubl_path);
  if (downloaded.error || !downloaded.data) throw new Error('ubl_download_failed');
  const ubl = Buffer.from(await downloaded.data.arrayBuffer());
  const actual = createHash('sha256').update(ubl).digest();
  const expected = Buffer.from(submission.ubl_sha256, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(actual, expected)) throw new Error('ubl_hash_mismatch');
  const credentials = decryptPeppolCredentials({
    ciphertext: secret.ciphertext, iv: secret.iv, authTag: secret.auth_tag, keyVersion: secret.key_version as 'v1',
  });
  const connector = getPeppolConnector(submission.provider_key);
  const result = submission.processing_operation === 'poll' && submission.external_submission_id
    ? await connector.poll({ externalSubmissionId: submission.external_submission_id, credentials })
    : await connector.submit({
        endpointId: invoice.customer_peppol_id, ubl, ublSha256: submission.ubl_sha256,
        idempotencyKey: submission.idempotency_key, credentials,
      });
  await finish(submission.id, result);
}

export async function processPeppolOutbox(limit = 10): Promise<{ disabled: boolean; claimed: number; completed: number }> {
  if (!peppolApiEnabled()) return { disabled: true, claimed: 0, completed: 0 };
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc('claim_peppol_submissions', { p_limit: limit });
  if (error) throw error;
  const submissions = (data ?? []) as ClaimedSubmission[];
  let completed = 0;
  for (const submission of submissions) {
    try {
      await processSubmission(submission);
      completed += 1;
    } catch (error) {
      const retryable = submission.attempts < 5;
      await finish(submission.id, {
        externalSubmissionId: '', transportStatus: 'failed', retryable,
        errorCode: 'connector_error',
        errorMessage: error instanceof Error ? error.message : 'unknown_connector_error',
      });
    }
  }
  return { disabled: false, claimed: submissions.length, completed };
}
