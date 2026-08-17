type MimeAttachment = {
  filename: string;
  contentType: string;
  content: Uint8Array;
};

export function buildMimeMessage(args: {
  to: string;
  from: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachment: MimeAttachment;
}): string {
  const mixedBoundary = `mixed_${crypto.randomUUID()}`;
  const alternativeBoundary = `alternative_${crypto.randomUUID()}`;
  const filename = safeFilename(args.attachment.filename);

  return [
    `From: ${safeHeader(args.from)}`,
    `To: ${safeHeader(args.to)}`,
    `Subject: ${encodeHeader(args.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(Buffer.from(args.textBody, 'utf8')),
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(Buffer.from(args.htmlBody, 'utf8')),
    '',
    `--${alternativeBoundary}--`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: ${args.attachment.contentType}; name="${filename}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${filename}"`,
    '',
    base64Lines(Buffer.from(args.attachment.content)),
    '',
    `--${mixedBoundary}--`,
    '',
  ].join('\r\n');
}

export function base64Url(value: string): string {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function plainTextToHtml(value: string): string {
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function base64Lines(value: Uint8Array): string {
  return Buffer.from(value).toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function safeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function encodeHeader(value: string): string {
  const safe = safeHeader(value);
  return `=?UTF-8?B?${Buffer.from(safe, 'utf8').toString('base64')}?=`;
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'offerte.pdf';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
