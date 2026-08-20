import { createHash } from 'node:crypto';

export function peppolSubmissionIdempotencyKey(contractorId: string, invoiceId: string, ublSha256: string): string {
  return createHash('sha256').update(`${contractorId}:${invoiceId}:${ublSha256}`, 'utf8').digest('hex');
}
