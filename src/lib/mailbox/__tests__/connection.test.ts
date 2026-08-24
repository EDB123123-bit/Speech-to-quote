import { beforeEach, describe, expect, it, vi } from 'vitest';

const hasAdminSupabaseConfig = vi.hoisted(() => vi.fn());
const createAdminSupabase = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase,
  hasAdminSupabaseConfig,
  SupabaseAdminConfigError: class extends Error {
    constructor() {
      super('Supabase service-role configuratie ontbreekt');
    }
  },
}));

import {
  getMailboxConnection,
  getMailboxSummary,
} from '@/lib/mailbox/connection';

function mailboxClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn(() => ({ eq, maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  return { from: vi.fn(() => ({ select })) };
}

beforeEach(() => {
  vi.clearAllMocks();
  hasAdminSupabaseConfig.mockReturnValue(true);
});

describe('mailbox connection configuration', () => {
  it('treats the optional mailbox summary as disconnected without a service key', async () => {
    hasAdminSupabaseConfig.mockReturnValue(false);

    await expect(getMailboxSummary('user-1')).resolves.toBeNull();
    expect(createAdminSupabase).not.toHaveBeenCalled();
  });

  it('loads a summary when the server-only client is configured', async () => {
    const summary = {
      provider: 'gmail',
      email_address: 'dakwerker@example.com',
      status: 'connected',
      connected_at: '2026-08-18T08:00:00Z',
    };
    createAdminSupabase.mockReturnValue(mailboxClient({ data: summary, error: null }));

    await expect(getMailboxSummary('user-1')).resolves.toEqual(summary);
  });

  it('fails mailbox operations with an actionable configuration error', async () => {
    hasAdminSupabaseConfig.mockReturnValue(false);

    await expect(getMailboxConnection('user-1')).rejects.toThrow(
      'Supabase service-role configuratie ontbreekt',
    );
  });
});
