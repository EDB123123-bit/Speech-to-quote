import { createHash } from 'node:crypto';

export function normalizeGmailBody(raw: string): string {
  return raw
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .filter((line) => !/^>/.test(line.trim()))
    .join('\n')
    .replace(/\n(?:On .+?wrote:|Op .+?schreef .+?:)[\s\S]*$/iu, '')
    .replace(/\n(?:-----Original Message-----|Begin forwarded message:)[\s\S]*$/iu, '')
    .replace(/\n--\s*\n[\s\S]*$/u, '')
    .replace(/[ \t]+\n/gu, '\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

export function hashGmailBody(body: string): string {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

export function emailFromHeader(value: string): string | null {
  const angle = value.match(/<([^>\s]+@[^>\s]+)>/u)?.[1];
  const plain = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0];
  return (angle || plain || '').trim().toLowerCase() || null;
}

export function senderNameFromHeader(value: string): string | null {
  const match = value.match(/^\s*"?([^"<]+?)"?\s*</u);
  return match?.[1]?.trim() || null;
}
