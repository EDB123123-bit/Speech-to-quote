import type { ClarificationStatus } from '@/lib/supabase/types';

/**
 * A garbled answer on a windy roof must not trap the contractor in a loop.
 * After this many unhelpful answers, the question stays pending and is
 * resolved manually via the on-screen checklist instead.
 */
export const MAX_CLARIFICATION_RETRIES = 2;

export function nextClarificationState(
  current: { retryCount: number },
  resolved: boolean,
): { status: ClarificationStatus; retryCount: number; shouldRephrase: boolean } {
  if (resolved) {
    return { status: 'resolved', retryCount: current.retryCount, shouldRephrase: false };
  }

  const capped = Math.min(current.retryCount, MAX_CLARIFICATION_RETRIES);
  if (capped >= MAX_CLARIFICATION_RETRIES) {
    return { status: 'pending', retryCount: MAX_CLARIFICATION_RETRIES, shouldRephrase: false };
  }

  return { status: 'pending', retryCount: capped + 1, shouldRephrase: true };
}
