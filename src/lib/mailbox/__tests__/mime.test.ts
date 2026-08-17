import { describe, expect, it } from 'vitest';
import { base64Url, buildMimeMessage, plainTextToHtml } from '@/lib/mailbox/mime';

describe('mailbox MIME helpers', () => {
  it('builds a multipart email with a PDF attachment', () => {
    const mime = buildMimeMessage({
      to: 'klant@example.com',
      from: 'dakwerker@example.com',
      subject: 'Offerte dakwerken',
      textBody: 'Beste klant,\n\nIn bijlage staat de offerte.',
      htmlBody: '<p>Beste klant,</p><p>In bijlage staat de offerte.</p>',
      attachment: {
        filename: 'offerte-1234.pdf',
        contentType: 'application/pdf',
        content: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      },
    });

    expect(mime).toContain('Content-Type: multipart/mixed');
    expect(mime).toContain('Content-Type: multipart/alternative');
    expect(mime).toContain('Content-Type: application/pdf; name="offerte-1234.pdf"');
    expect(mime).toContain('Content-Disposition: attachment; filename="offerte-1234.pdf"');
    expect(mime).toContain('JVBERg==');
  });

  it('removes header newlines and safely escapes user text in HTML', () => {
    const mime = buildMimeMessage({
      to: 'klant@example.com',
      from: 'dakwerker@example.com',
      subject: 'Offerte\r\nBcc: attacker@example.com',
      textBody: '<script>alert(1)</script>',
      htmlBody: plainTextToHtml('<script>alert(1)</script>'),
      attachment: {
        filename: 'offerte.pdf',
        contentType: 'application/pdf',
        content: new Uint8Array(),
      },
    });

    expect(mime).not.toContain('\r\nBcc:');
    expect(plainTextToHtml('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(base64Url('test')).toBe('dGVzdA');
  });
});
