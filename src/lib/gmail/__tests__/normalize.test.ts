import { describe, expect, it } from 'vitest';
import { emailFromHeader, hashGmailBody, normalizeGmailBody, senderNameFromHeader } from '../normalize';

describe('Gmail body normalization', () => {
  it('removes quoted replies and signatures while preserving the human body', () => {
    const body = normalizeGmailBody('Hallo,\r\n\r\nGraag een offerte voor 20 m² dak.\n\n--\nEdouard\n\nOp maandag schreef klant:\n> oude vraag');
    expect(body).toBe('Hallo,\n\nGraag een offerte voor 20 m² dak.');
  });

  it('extracts sender identity and produces stable hashes', () => {
    expect(emailFromHeader('Jan Peeters <JAN@example.com>')).toBe('jan@example.com');
    expect(senderNameFromHeader('Jan Peeters <jan@example.com>')).toBe('Jan Peeters');
    expect(hashGmailBody('abc')).toBe(hashGmailBody('abc'));
    expect(hashGmailBody('abc')).not.toBe(hashGmailBody('abcd'));
  });
});
