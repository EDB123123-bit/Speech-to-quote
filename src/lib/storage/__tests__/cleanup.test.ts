import { describe, it, expect } from 'vitest';
import { findCleanupCandidates } from '@/lib/storage/cleanup';

const base = {
  id: 'q1', contractor_id: 'c1', audio_path: 'c1/a.webm',
  transcript: 'tachtig vierkante meter', audio_deleted_at: null as string | null,
};

describe('findCleanupCandidates', () => {
  it('selects a transcribed recording', () => {
    expect(findCleanupCandidates([base])).toEqual(['q1']);
  });

  it('keeps a recording that was never transcribed — it may still be retried', () => {
    expect(findCleanupCandidates([{ ...base, transcript: null }])).toEqual([]);
  });

  it('keeps a recording whose transcript is blank', () => {
    expect(findCleanupCandidates([{ ...base, transcript: '   ' }])).toEqual([]);
  });

  it('skips a recording already deleted', () => {
    expect(findCleanupCandidates([{ ...base, audio_deleted_at: '2026-08-06T00:00:00Z' }])).toEqual([]);
  });

  it('skips a quote with no audio path', () => {
    expect(findCleanupCandidates([{ ...base, audio_path: null }])).toEqual([]);
  });

  it('handles a mixed batch', () => {
    expect(
      findCleanupCandidates([
        base,
        { ...base, id: 'q2', transcript: null },
        { ...base, id: 'q3' },
      ]),
    ).toEqual(['q1', 'q3']);
  });
});
