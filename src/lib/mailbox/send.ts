import type { MailboxProvider } from '@/lib/supabase/types';
import { markMailboxDisconnected } from './connection';
import { MailboxError } from './errors';
import { base64Url, buildMimeMessage, plainTextToHtml } from './mime';
import { getMailboxWithValidToken } from './token';

export type SendQuoteEmailResult = {
  provider: MailboxProvider;
  from: string;
  messageId: string | null;
};

export type MailboxAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
};

export async function sendMailboxEmail(args: {
  userId: string;
  to: string;
  subject: string;
  message: string;
  attachment?: MailboxAttachment;
}): Promise<SendQuoteEmailResult> {
  const mailbox = await getMailboxWithValidToken(args.userId);
  const htmlBody = plainTextToHtml(args.message);

  if (mailbox.provider === 'gmail') {
    const mime = buildMimeMessage({
      to: args.to,
      from: mailbox.email_address,
      subject: args.subject,
      textBody: args.message,
      htmlBody,
      attachment: args.attachment,
    });

    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mailbox.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: base64Url(mime) }),
      },
    );

    if (!response.ok) {
      console.error('[mailbox:gmail] send failed', response.status);
      if (response.status === 401) {
        await markMailboxDisconnected(mailbox.id);
        throw new MailboxError(
          'disconnected',
          'De Gmail-verbinding is verlopen. Verbind je mailbox opnieuw.',
        );
      }
      throw new MailboxError('provider_failed', 'Gmail kon de offerte niet versturen.');
    }

    const body = (await response.json()) as { id?: string };
    return { provider: 'gmail', from: mailbox.email_address, messageId: body.id ?? null };
  }

  const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${mailbox.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: args.subject,
        body: { contentType: 'HTML', content: htmlBody },
        toRecipients: [{ emailAddress: { address: args.to } }],
        ...(args.attachment ? {
          attachments: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              name: args.attachment.filename,
              contentType: args.attachment.contentType,
              contentBytes: Buffer.from(args.attachment.content).toString('base64'),
            },
          ],
        } : {}),
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    console.error('[mailbox:outlook] send failed', response.status);
    if (response.status === 401) {
      await markMailboxDisconnected(mailbox.id);
      throw new MailboxError(
        'disconnected',
        'De Outlook-verbinding is verlopen. Verbind je mailbox opnieuw.',
      );
    }
    throw new MailboxError('provider_failed', 'Outlook kon de offerte niet versturen.');
  }

  return { provider: 'outlook', from: mailbox.email_address, messageId: null };
}

export async function sendQuoteEmail(args: {
  userId: string;
  to: string;
  subject: string;
  message: string;
  pdf: Uint8Array;
  filename: string;
}): Promise<SendQuoteEmailResult> {
  return sendMailboxEmail({
    userId: args.userId,
    to: args.to,
    subject: args.subject,
    message: args.message,
    attachment: {
      filename: args.filename,
      contentType: 'application/pdf',
      content: args.pdf,
    },
  });
}
