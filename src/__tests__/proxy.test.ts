import { describe, expect, it } from 'vitest';
import { config, isAuthEntryPath, isMarketingPath, isPublicPath } from '@/proxy';

describe('public route boundary', () => {
  it('serves the marketing home page without a contractor session', () => {
    expect(isPublicPath('/')).toBe(true);
    expect(isMarketingPath('/')).toBe(true);
  });

  it('keeps the marketing boundary to the exact root', () => {
    expect(isMarketingPath('/offertes')).toBe(false);
    expect(isMarketingPath('/instellingen')).toBe(false);
    expect(isPublicPath('/klanten')).toBe(false);
    expect(isPublicPath('/api/quotes/generate')).toBe(false);
  });

  it('lets marketing assets skip the session check', () => {
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    expect(matcher.test('/marketing/explainer.mp4')).toBe(false);
    expect(matcher.test('/_vercel/insights/script.js')).toBe(false);
    expect(matcher.test('/offertes')).toBe(true);
    expect(matcher.test('/')).toBe(true);
    expect(matcher.test('/marketingplan')).toBe(true);
  });

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
