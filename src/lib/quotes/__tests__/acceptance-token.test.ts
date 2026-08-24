import { describe, expect, it } from 'vitest';
import { acceptanceUrl, hashAcceptanceToken } from '@/lib/quotes/acceptance-token';

describe('quote acceptance tokens', () => {
  it('stores a one-way SHA-256 hash and builds a URL without exposing it', () => {
    const token = 'a'.repeat(64);
    const hash = hashAcceptanceToken(token);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(token);
    expect(acceptanceUrl('https://werkoffertes.example/', token)).toBe(`https://werkoffertes.example/offerte/${token}`);
  });
});
