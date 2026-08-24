import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireContractor: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@/lib/auth/require-contractor', () => ({
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireContractor: mocks.requireContractor,
}));

import { completeOnboarding, getOnboardingStatus } from '../onboarding-actions';

describe('onboarding actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eq.mockResolvedValue({ error: null });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.requireContractor.mockResolvedValue({
      contractor: { id: 'contractor-1', onboarding_completed_at: null },
      supabase: { from: vi.fn().mockReturnValue({ update: mocks.update }) },
    });
  });

  it('shows the tour only until it has been completed', async () => {
    await expect(getOnboardingStatus()).resolves.toEqual({ show: true });

    mocks.requireContractor.mockResolvedValueOnce({
      contractor: { id: 'contractor-1', onboarding_completed_at: '2026-08-24T10:00:00.000Z' },
      supabase: {},
    });
    await expect(getOnboardingStatus()).resolves.toEqual({ show: false });
  });

  it('stores completion on the signed-in contractor row', async () => {
    await completeOnboarding();

    expect(mocks.update).toHaveBeenCalledWith({
      onboarding_completed_at: expect.any(String),
    });
    expect(mocks.eq).toHaveBeenCalledWith('id', 'contractor-1');
  });

  it('reports a failed completion write', async () => {
    mocks.eq.mockResolvedValue({ error: { message: 'write failed' } });
    await expect(completeOnboarding()).rejects.toThrow('De uitlegstatus kon niet worden opgeslagen.');
  });
});
