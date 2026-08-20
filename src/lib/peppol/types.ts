export type PeppolTransportStatus = 'queued' | 'submitted' | 'delivered' | 'failed';
export type PeppolBusinessResponseStatus =
  | 'received' | 'accepted' | 'conditionally_accepted' | 'rejected'
  | 'processing' | 'paid' | 'information_required';

export type PeppolCredentials = Record<string, string>;

export type PeppolSubmissionResult = {
  externalSubmissionId: string;
  transportStatus: Exclude<PeppolTransportStatus, 'queued'>;
  businessResponseStatus?: PeppolBusinessResponseStatus;
  retryable?: boolean;
  errorCode?: string;
  errorMessage?: string;
};

export interface PeppolConnector {
  readonly key: string;
  verifyCredentials(credentials: PeppolCredentials): Promise<{ externalAccountId?: string }>;
  discoverRecipient(endpointId: string, credentials: PeppolCredentials): Promise<{ reachable: boolean; documentTypes: string[] }>;
  submit(input: { endpointId: string; ubl: Uint8Array; ublSha256: string; idempotencyKey: string; credentials: PeppolCredentials }): Promise<PeppolSubmissionResult>;
  poll(input: { externalSubmissionId: string; credentials: PeppolCredentials }): Promise<PeppolSubmissionResult>;
  parseWebhook(input: { headers: Headers; body: Uint8Array; credentials: PeppolCredentials }): Promise<PeppolSubmissionResult>;
  revoke(credentials: PeppolCredentials): Promise<void>;
}
