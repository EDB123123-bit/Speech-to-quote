import { beforeEach, describe, expect, it, vi } from 'vitest';
import { markMailboxDisconnected } from '@/lib/mailbox/connection';
import { MailboxError } from '@/lib/mailbox/errors';
import { sendQuoteEmail } from '@/lib/mailbox/send';
import { getMailboxWithValidToken } from '@/lib/mailbox/token';
import type { MailboxConnection } from '@/lib/supabase/types';

vi.mock('@/lib/mailbox/token', () => ({ getMailboxWithValidToken: vi.fn() }));
vi.mock('@/lib/mailbox/connection', () => ({ markMailboxDisconnected: vi.fn() }));

const connection: MailboxConnection = {
  id: 'mailbox-1',
  user_id: 'user-1',
  provider: 'gmail',
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  email_address: 'dakwerker@example.com',
  token_expires_at: '2026-08-16T22:00:00Z',
  status: 'connected',
  connected_at: '2026-08-16T20:00:00Z',
  updated_at: '2026-08-16T20:00:00Z',
};

const args = {
  userId: 'user-1',
  to: 'klant@example.com',
  subject: 'Offerte dakwerken',
  message: 'Beste klant,\n\nIn bijlage staat de offerte.',
  pdf: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
  filename: 'offerte-1234.pdf',
};

beforeEach(() => {
  vi.clearAllMocks();
  (getMailboxWithValidToken as ReturnType<typeof vi.fn>).mockResolvedValue(connection);
});

describe('sendQuoteEmail', () => {
  it('sends a PDF MIME attachment through Gmail', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'gmail-message-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendQuoteEmail(args)).resolves.toEqual({
      provider: 'gmail',
      from: connection.email_address,
      messageId: 'gmail-message-1',
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string) as { raw: string };
    const mime = Buffer.from(body.raw, 'base64url').toString('utf8');
    expect(mime).toContain('Content-Disposition: attachment; filename="offerte-1234.pdf"');
    expect(mime).toContain('JVBERg==');
  });

  it('sends a JSON file attachment through Outlook', async () => {
    (getMailboxWithValidToken as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...connection,
      provider: 'outlook',
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendQuoteEmail(args)).resolves.toMatchObject({ provider: 'outlook' });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(request.body as string) as {
      message: { attachments: Array<{ name: string; contentBytes: string }> };
    };
    expect(body.message.attachments[0]).toMatchObject({
      name: 'offerte-1234.pdf',
      contentBytes: 'JVBERg==',
    });
  });

  it('marks a mailbox disconnected when the provider rejects its access token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));

    await expect(sendQuoteEmail(args)).rejects.toEqual(
      expect.objectContaining<Partial<MailboxError>>({ code: 'disconnected' }),
    );
    expect(markMailboxDisconnected).toHaveBeenCalledWith(connection.id);
  });
});
