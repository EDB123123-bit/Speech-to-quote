import { describe, it, expect, vi, beforeEach } from 'vitest';

const insert = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({ from: () => ({ insert }) }),
}));

import { logPipelineEvent, serialiseError, truncate } from '@/lib/logging/pipeline-events';

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('kort', 10)).toBe('kort');
  });

  it('cuts long text and marks it', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcde… [afgekapt]');
  });
});

describe('serialiseError', () => {
  it('captures name, message, and stack from an Error', () => {
    const result = serialiseError(new TypeError('kapot'));
    expect(result.name).toBe('TypeError');
    expect(result.message).toBe('kapot');
    expect(typeof result.stack).toBe('string');
  });

  it('handles a non-Error value', () => {
    expect(serialiseError('gewoon een string')).toEqual({ message: 'gewoon een string' });
  });
});

describe('logPipelineEvent', () => {
  it('inserts a row with the given fields', async () => {
    await logPipelineEvent({
      quoteId: 'quote-1',
      contractorId: 'contractor-1',
      step: 'transcribe',
      status: 'success',
      detail: { durationMs: 1200 },
    });

    expect(insert).toHaveBeenCalledWith({
      quote_id: 'quote-1',
      contractor_id: 'contractor-1',
      step: 'transcribe',
      status: 'success',
      detail: { durationMs: 1200 },
    });
  });

  it('defaults detail to an empty object', async () => {
    await logPipelineEvent({
      quoteId: null,
      contractorId: 'contractor-1',
      step: 'upload',
      status: 'error',
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ detail: {} }));
  });

  it('never throws when the insert fails — logging must not break the pipeline', async () => {
    insert.mockResolvedValue({ error: { message: 'db down' } });
    await expect(
      logPipelineEvent({ quoteId: null, contractorId: 'c1', step: 'extract', status: 'success' }),
    ).resolves.toBeUndefined();
  });

  it('never throws when the client itself blows up', async () => {
    insert.mockRejectedValue(new Error('network'));
    await expect(
      logPipelineEvent({ quoteId: null, contractorId: 'c1', step: 'extract', status: 'success' }),
    ).resolves.toBeUndefined();
  });
});
