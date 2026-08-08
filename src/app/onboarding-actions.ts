'use server';

import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';

export async function getOnboardingStatus(): Promise<{ show: boolean }> {
  try {
    const { contractor } = await requireContractor();
    return { show: contractor.onboarding_completed_at === null };
  } catch (error) {
    if (error instanceof UnauthorizedError) return { show: false };
    throw error;
  }
}

export async function completeOnboarding(): Promise<void> {
  try {
    const { supabase, contractor } = await requireContractor();
    await supabase
      .from('contractors')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', contractor.id);
  } catch (error) {
    if (error instanceof UnauthorizedError) return;
    throw error;
  }
}
