import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PeppolConnector, PeppolCredentials, PeppolSubmissionResult } from './types';

export class FakePeppolConnector implements PeppolConnector {
  readonly key = 'fake';
  private readonly submissions = new Map<string, PeppolSubmissionResult>();

  async verifyCredentials(credentials: PeppolCredentials) {
    if (!credentials.apiKey) throw new Error('invalid_credentials');
    return { externalAccountId: 'fake-account' };
  }
  async discoverRecipient(endpointId: string) {
    return { reachable: /^0208:\d{10}$/u.test(endpointId), documentTypes: ['invoice', 'credit_note'] };
  }
  async submit(input: { idempotencyKey: string }) {
    const existing = this.submissions.get(input.idempotencyKey);
    if (existing) return existing;
    const result: PeppolSubmissionResult = { externalSubmissionId: `fake-${input.idempotencyKey.slice(0, 16)}`, transportStatus: 'submitted' };
    this.submissions.set(input.idempotencyKey, result);
    return result;
  }
  async poll(input: { externalSubmissionId: string }): Promise<PeppolSubmissionResult> {
    return { externalSubmissionId: input.externalSubmissionId, transportStatus: 'delivered', businessResponseStatus: 'accepted' as const };
  }
  async parseWebhook(input: { headers: Headers; body: Uint8Array; credentials: PeppolCredentials }) {
    const expected = createHmac('sha256', input.credentials.webhookSecret ?? '').update(input.body).digest();
    const supplied = Buffer.from(input.headers.get('x-fake-signature') ?? '', 'hex');
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error('invalid_webhook_signature');
    return JSON.parse(Buffer.from(input.body).toString('utf8')) as PeppolSubmissionResult;
  }
  async revoke() { return; }
}
