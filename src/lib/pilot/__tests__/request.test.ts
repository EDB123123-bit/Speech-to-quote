import { describe, expect, it } from 'vitest';
import {
  isPlausiblePhone,
  parsePilotRequest,
  parseSource,
  pilotNotificationText,
  toPilotRow,
} from '@/lib/pilot/request';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = {
  name: '  Jan   Peeters ',
  company: 'Dakwerken Peeters',
  phone: '0470 12 34 56',
  email: 'Jan@Dakwerken-Peeters.be',
  region: 'vlaanderen',
  quotesPerMonth: '10-30',
  note: 'Nu typ ik alles in Word.',
};

describe('parsePilotRequest', () => {
  it('normalises a complete request', () => {
    const result = parsePilotRequest(form(valid));
    expect(result).toEqual({
      ok: true,
      data: {
        name: 'Jan Peeters',
        company: 'Dakwerken Peeters',
        phone: '0470 12 34 56',
        email: 'jan@dakwerken-peeters.be',
        region: 'vlaanderen',
        quotesPerMonth: '10-30',
        note: 'Nu typ ik alles in Word.',
        source: {},
      },
    });
  });

  it('only needs a name, a phone number and a region', () => {
    const result = parsePilotRequest(form({ name: 'Anouk', phone: '+31 6 12345678', region: 'nederland' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toMatchObject({ company: null, email: null, quotesPerMonth: null, note: null });
  });

  it('explains every missing or invalid field in Dutch', () => {
    const result = parsePilotRequest(form({ email: 'geen-adres', region: 'wallonie', quotesPerMonth: 'veel' }));
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        name: 'Vul je naam in.',
        phone: 'Vul een telefoonnummer in waarop we je kunnen bereiken.',
        email: 'Dit e-mailadres klopt niet.',
        region: 'Kies waar je vooral werkt.',
        quotesPerMonth: 'Kies een van de opties.',
      },
    });
  });

  it('rejects text that is not a phone number', () => {
    const result = parsePilotRequest(form({ ...valid, phone: 'bel me maar' }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { phone: expect.stringContaining('klopt niet') } });
  });

  it('keeps only known campaign attribution keys', () => {
    const source = JSON.stringify({ utm_source: 'facebook', utm_campaign: 'pilot-sept', referrer: 'https://l.facebook.com/', admin: true });
    const result = parsePilotRequest(form({ ...valid, source }));
    expect(result.ok && result.data.source).toEqual({
      utm_source: 'facebook',
      utm_campaign: 'pilot-sept',
      referrer: 'https://l.facebook.com/',
    });
  });
});

describe('isPlausiblePhone', () => {
  it.each(['0470 12 34 56', '+32 479 87 08 89', '011/12.34.56', '06-12345678', '+31 (0)6 1234 5678'])('accepts %s', (phone) => {
    expect(isPlausiblePhone(phone)).toBe(true);
  });

  it.each(['1234', '0470 12 34 56 78 90 12 34', 'nul vier zeven', '0470<script>'])('rejects %s', (phone) => {
    expect(isPlausiblePhone(phone)).toBe(false);
  });
});

describe('parseSource', () => {
  it('ignores malformed attribution instead of failing the request', () => {
    expect(parseSource('{not json')).toEqual({});
    expect(parseSource('["utm_source"]')).toEqual({});
    expect(parseSource('')).toEqual({});
  });
});

describe('storage and notification', () => {
  it('maps a request onto the pilot_requests columns', () => {
    const result = parsePilotRequest(form(valid));
    if (!result.ok) throw new Error('expected a valid request');
    expect(toPilotRow(result.data)).toEqual({
      name: 'Jan Peeters',
      company: 'Dakwerken Peeters',
      phone: '0470 12 34 56',
      email: 'jan@dakwerken-peeters.be',
      region: 'vlaanderen',
      quotes_per_month: '10-30',
      note: 'Nu typ ik alles in Word.',
      source: {},
    });
  });

  it('summarises a request for a chat notification', () => {
    const result = parsePilotRequest(form({ ...valid, source: JSON.stringify({ utm_source: 'facebook' }) }));
    if (!result.ok) throw new Error('expected a valid request');
    expect(pilotNotificationText(result.data)).toBe(
      'Nieuwe pilotaanvraag: Jan Peeters (Dakwerken Peeters)\n'
        + '0470 12 34 56 | jan@dakwerken-peeters.be | Vlaanderen of Brussel | 10 tot 30 offertes per maand | via facebook\n'
        + '> Nu typ ik alles in Word.',
    );
  });
});
