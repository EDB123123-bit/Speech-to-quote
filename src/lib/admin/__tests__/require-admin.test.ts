import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  hasConfig: vi.fn(),
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
}));

vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  hasAdminSupabaseConfig: mocks.hasConfig,
  createAdminSupabase: () => ({
    from: () => ({ select: () => ({ eq: mocks.eq }) }),
  }),
}));

import { isAppAdmin, requireAdmin } from '../require-admin';

describe('admin access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hasConfig.mockReturnValue(true);
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockResolvedValue({ data: { user_id: 'admin-1' }, error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  });

  it('lets a listed admin in and hands back the server client', async () => {
    const result = await requireAdmin();
    expect(result.userId).toBe('admin-1');
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'admin-1');
  });

  it('answers 404 to a signed-in contractor who is not an admin', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('answers 404 to visitors who are not signed in', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
    expect(mocks.eq).not.toHaveBeenCalled();
  });

  it('treats a failed admin lookup as not an admin', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null, error: { message: 'relation "app_admins" does not exist' } });
    await expect(isAppAdmin('admin-1')).resolves.toBe(false);
    await expect(requireAdmin()).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('never grants access without server credentials', async () => {
    mocks.hasConfig.mockReturnValue(false);
    await expect(isAppAdmin('admin-1')).resolves.toBe(false);
    expect(mocks.eq).not.toHaveBeenCalled();
  });
});
