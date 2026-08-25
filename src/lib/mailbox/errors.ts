export type MailboxErrorCode =
  | 'not_connected'
  | 'disconnected'
  | 'configuration'
  | 'refresh_failed'
  | 'provider_failed'
  | 'gmail_read_not_connected';

export class MailboxError extends Error {
  constructor(
    public readonly code: MailboxErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MailboxError';
  }
}
