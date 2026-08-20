import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { PeppolCredentials } from './types';

type EncryptedCredentials = { ciphertext: string; iv: string; authTag: string; keyVersion: 'v1' };

function encryptionKey(): Buffer {
  const encoded = process.env.PEPPOL_CREDENTIAL_ENCRYPTION_KEY;
  if (!encoded) throw new Error('PEPPOL_CREDENTIAL_ENCRYPTION_KEY is required for provider credentials.');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32) throw new Error('PEPPOL_CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
}

export function encryptPeppolCredentials(credentials: PeppolCredentials): EncryptedCredentials {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64'), keyVersion: 'v1' };
}

export function decryptPeppolCredentials(value: EncryptedCredentials): PeppolCredentials {
  if (value.keyVersion !== 'v1') throw new Error('Unsupported Peppol credential key version.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(value.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8')) as PeppolCredentials;
}
