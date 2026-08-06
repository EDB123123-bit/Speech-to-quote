import { describe, it, expect } from 'vitest';
import { nextClarificationState, MAX_CLARIFICATION_RETRIES } from '@/lib/clarifications/retry';

describe('nextClarificationState', () => {
  it('resolves the clarification when the answer addressed it', () => {
    expect(nextClarificationState({ retryCount: 0 }, true)).toEqual({
      status: 'resolved',
      retryCount: 0,
      shouldRephrase: false,
    });
  });

  it('resolves even on the last allowed attempt', () => {
    expect(nextClarificationState({ retryCount: MAX_CLARIFICATION_RETRIES }, true).status).toBe('resolved');
  });

  it('asks a rephrased question on the first unhelpful answer', () => {
    expect(nextClarificationState({ retryCount: 0 }, false)).toEqual({
      status: 'pending',
      retryCount: 1,
      shouldRephrase: true,
    });
  });

  it('asks once more on the second unhelpful answer', () => {
    expect(nextClarificationState({ retryCount: 1 }, false)).toEqual({
      status: 'pending',
      retryCount: 2,
      shouldRephrase: true,
    });
  });

  it('stops rephrasing once the cap is reached, leaving it for manual resolution', () => {
    expect(nextClarificationState({ retryCount: MAX_CLARIFICATION_RETRIES }, false)).toEqual({
      status: 'pending',
      retryCount: MAX_CLARIFICATION_RETRIES,
      shouldRephrase: false,
    });
  });

  it('never exceeds the cap', () => {
    expect(nextClarificationState({ retryCount: 99 }, false).retryCount).toBe(MAX_CLARIFICATION_RETRIES);
  });
});
