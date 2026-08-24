import { getMailboxWithValidTokenForProvider } from './token';
import { MailboxError } from './errors';

export type GmailMessageSummary = {
  id: string;
  threadId: string | null;
  sender: string;
  subject: string;
  receivedAt: string;
  snippet: string;
};

export type GmailAttachment = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type GmailMessageContent = GmailMessageSummary & {
  body: string;
  attachments: GmailAttachment[];
};

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  filename?: string;
  mimeType?: string;
  body?: { data?: string; attachmentId?: string; size?: number };
  headers?: GmailHeader[];
  parts?: GmailPart[];
};
type GmailMessage = {
  id?: string;
  threadId?: string;
  internalDate?: string;
  snippet?: string;
  payload?: GmailPart;
};

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

export async function listGmailMessages(userId: string, query?: string): Promise<GmailMessageSummary[]> {
  const connection = await getMailboxWithValidTokenForProvider(userId, 'gmail');
  if (connection.gmail_read_enabled === false) {
    throw new MailboxError('gmail_read_not_connected', 'Herverbinden is nodig om Gmail-berichten te lezen.');
  }
  const params = new URLSearchParams({ maxResults: '25', includeSpamTrash: 'false' });
  params.set('q', query?.trim() || 'in:inbox newer_than:30d');
  const response = await gmailFetch(connection.access_token, `/messages?${params.toString()}`);
  const listed = await response.json() as { messages?: Array<{ id?: string; threadId?: string }> };
  const ids = (listed.messages ?? []).map((item) => item.id).filter((id): id is string => Boolean(id));
  return Promise.all(ids.map((id) => getGmailMessageSummary(connection.access_token, id)));
}

export async function fetchGmailMessage(userId: string, messageId: string): Promise<GmailMessageContent> {
  const connection = await getMailboxWithValidTokenForProvider(userId, 'gmail');
  if (connection.gmail_read_enabled === false) {
    throw new MailboxError('gmail_read_not_connected', 'Herverbinden is nodig om Gmail-berichten te lezen.');
  }
  const response = await gmailFetch(connection.access_token, `/messages/${encodeURIComponent(messageId)}?format=full`);
  const message = await response.json() as GmailMessage;
  const headers = headerMap(message.payload?.headers ?? []);
  const parts = flattenParts(message.payload);
  const attachments: GmailAttachment[] = [];
  for (const part of parts) {
    const filename = part.filename?.trim();
    if (!filename) continue;
    const bytes = part.body?.attachmentId
      ? await downloadGmailAttachment(connection.access_token, message.id ?? messageId, part.body.attachmentId)
      : decodeBase64Url(part.body?.data ?? '');
    attachments.push({ filename, mimeType: part.mimeType || 'application/octet-stream', bytes });
  }
  const body = chooseBody(parts);
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : new Date(headers.date || Date.now()).toISOString();
  return {
    id: message.id ?? messageId,
    threadId: message.threadId ?? null,
    sender: headers.from || '',
    subject: headers.subject || '(zonder onderwerp)',
    receivedAt,
    snippet: message.snippet || body.slice(0, 240),
    body,
    attachments,
  };
}

async function getGmailMessageSummary(accessToken: string, id: string): Promise<GmailMessageSummary> {
  const response = await gmailFetch(accessToken, `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`);
  const message = await response.json() as GmailMessage;
  const headers = headerMap(message.payload?.headers ?? []);
  const receivedAt = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : new Date(headers.date || Date.now()).toISOString();
  return {
    id,
    threadId: message.threadId ?? null,
    sender: headers.from || 'Onbekende afzender',
    subject: headers.subject || '(zonder onderwerp)',
    receivedAt,
    snippet: message.snippet || '',
  };
}

async function downloadGmailAttachment(accessToken: string, messageId: string, attachmentId: string): Promise<Uint8Array> {
  const response = await gmailFetch(accessToken, `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`);
  const data = await response.json() as { data?: string };
  return decodeBase64Url(data.data ?? '');
}

async function gmailFetch(accessToken: string, path: string): Promise<Response> {
  const response = await fetch(`${GMAIL_API}${path}`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.ok) return response;
  if (response.status === 401) throw new MailboxError('disconnected', 'De Gmail-verbinding is verlopen. Verbind je mailbox opnieuw.');
  if (response.status === 403) throw new MailboxError('gmail_read_not_connected', 'Gmail-leestoegang ontbreekt. Verbind Gmail opnieuw met leesrechten.');
  throw new MailboxError('provider_failed', 'Gmail kon de berichten niet laden.');
}

function headerMap(headers: GmailHeader[]): Record<string, string> {
  return Object.fromEntries(headers.map((header) => [String(header.name ?? '').toLowerCase(), String(header.value ?? '')]));
}

function flattenParts(part: GmailPart | undefined): GmailPart[] {
  if (!part) return [];
  return [part, ...(part.parts ?? []).flatMap(flattenParts)];
}

function chooseBody(parts: GmailPart[]): string {
  const plain = parts.find((part) => part.mimeType === 'text/plain' && !part.filename);
  if (plain?.body?.data) return Buffer.from(decodeBase64Url(plain.body.data)).toString('utf8');
  const html = parts.find((part) => part.mimeType === 'text/html' && !part.filename);
  if (html?.body?.data) return htmlToText(Buffer.from(decodeBase64Url(html.body.data)).toString('utf8'));
  return '';
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/gu, '+').replace(/_/gu, '/');
  return new Uint8Array(Buffer.from(normalized, 'base64'));
}

function htmlToText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/giu, ' ')
    .replace(/<script[\s\S]*?<\/script>/giu, ' ')
    .replace(/<br\s*\/?>(?!\n)/giu, '\n')
    .replace(/<\/p>|<\/div>|<\/li>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/gu, ' ')
    .replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>')
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}
