import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createClient = vi.hoisted(() => vi.fn(() => ({ admin: true })));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

import {
  createAdminSupabase,
  hasAdminSupabaseConfig,
  SupabaseAdminConfigError,
} from '@/lib/supabase/admin';

const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = '  https://example.supabase.co  ';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  createClient.mockClear();
});

afterEach(() => {
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;

  if (originalServiceRoleKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceRoleKey;
});

describe('server-only Supabase client', () => {
  it('reports incomplete configuration without exposing a Supabase constructor error', () => {
    expect(hasAdminSupabaseConfig()).toBe(false);
    expect(() => createAdminSupabase()).toThrow(SupabaseAdminConfigError);
    expect(() => createAdminSupabase()).toThrow('SUPABASE_SERVICE_ROLE_KEY');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('constructs the client with trimmed server credentials', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = '  service-role-key  ';

    expect(hasAdminSupabaseConfig()).toBe(true);
    expect(createAdminSupabase()).toEqual({ admin: true });
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'service-role-key',
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  });
});
