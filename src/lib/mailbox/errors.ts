export type MailboxErrorCode =
  | 'not_connected'
  | 'disconnected'
  | 'configuration'
  | 'refresh_failed'
  | 'provider_failed';

export class MailboxError extends Error {
  constructor(
    public readonly code: MailboxErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MailboxError';
  }
}
