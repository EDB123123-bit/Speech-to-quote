import { describe, expect, it } from 'vitest';
import { isAuthEntryPath, isPublicPath } from '@/proxy';

describe('public route boundary', () => {
  it('allows token-based customer acceptance without contractor login', () => {
    expect(isPublicPath('/offerte/token-value')).toBe(true);
    expect(isPublicPath('/api/offerte/token-value/accept')).toBe(true);
  });

  it('does not make internal quote routes public by prefix accident', () => {
    expect(isPublicPath('/offertes')).toBe(false);
    expect(isPublicPath('/offertes/quote-id')).toBe(false);
    expect(isPublicPath('/api/quotes/quote-id/send')).toBe(false);
  });

  it('only redirects signed-in users away from authentication entry pages', () => {
    expect(isAuthEntryPath('/login')).toBe(true);
    expect(isAuthEntryPath('/auth/callback')).toBe(true);
    expect(isAuthEntryPath('/offerte/token-value')).toBe(false);
    expect(isAuthEntryPath('/api/offerte/token-value/accept')).toBe(false);
  });
});
