import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { decryptPeppolCredentials, encryptPeppolCredentials } from '../crypto';
import { FakePeppolConnector } from '../fake-connector';
import { peppolSubmissionIdempotencyKey } from '../idempotency';

afterEach(() => { delete process.env.PEPPOL_CREDENTIAL_ENCRYPTION_KEY; });

describe('provider-neutral Peppol contract', () => {
  it('derives stable submission idempotency', () => {
    const first = peppolSubmissionIdempotencyKey('tenant', 'invoice', 'a'.repeat(64));
    expect(first).toBe(peppolSubmissionIdempotencyKey('tenant', 'invoice', 'a'.repeat(64)));
    expect(first).not.toBe(peppolSubmissionIdempotencyKey('tenant', 'invoice', 'b'.repeat(64)));
  });

  it('encrypts opaque credentials with AES-256-GCM', () => {
    process.env.PEPPOL_CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    const encrypted = encryptPeppolCredentials({ apiKey: 'secret' });
    expect(encrypted.ciphertext).not.toContain('secret');
    expect(decryptPeppolCredentials(encrypted)).toEqual({ apiKey: 'secret' });
  });

  it('submits idempotently and authenticates webhooks', async () => {
    const connector = new FakePeppolConnector();
    const input = { endpointId: '0208:0563846944', ubl: new Uint8Array(), ublSha256: 'a'.repeat(64), idempotencyKey: 'stable', credentials: { apiKey: 'x' } };
    expect(await connector.submit(input)).toEqual(await connector.submit(input));
    const body = Buffer.from(JSON.stringify({ externalSubmissionId: 'fake-stable', transportStatus: 'delivered' }));
    const signature = createHmac('sha256', 'webhook').update(body).digest('hex');
    const result = await connector.parseWebhook({ headers: new Headers({ 'x-fake-signature': signature }), body, credentials: { webhookSecret: 'webhook' } });
    expect(result.transportStatus).toBe('delivered');
  });
});
