import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreateServerSupabase = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => mockCreateServerSupabase(),
}));

import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';

const contractor = {
  id: 'user-1',
  company_name: 'Dakwerken Janssens',
  address: null,
  vat_number: null,
  phone: null,
  created_at: '2026-08-06T00:00:00Z',
};

function supabaseStub(user: { id: string } | null, row: typeof contractor | null) {
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: row, error: row ? null : { message: 'not found' } }),
        }),
      }),
    }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('requireContractor', () => {
  it('returns the contractor when a session exists', async () => {
    mockCreateServerSupabase.mockResolvedValue(supabaseStub({ id: 'user-1' }, contractor));
    const result = await requireContractor();
    expect(result.contractor.company_name).toBe('Dakwerken Janssens');
  });

  it('throws UnauthorizedError when there is no session', async () => {
    mockCreateServerSupabase.mockResolvedValue(supabaseStub(null, null));
    await expect(requireContractor()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('throws UnauthorizedError when the contractor row is missing', async () => {
    mockCreateServerSupabase.mockResolvedValue(supabaseStub({ id: 'user-1' }, null));
    await expect(requireContractor()).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
