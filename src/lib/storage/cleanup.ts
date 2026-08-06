export type CleanupCandidate = {
  id: string;
  contractor_id: string;
  audio_path: string | null;
  transcript: string | null;
  audio_deleted_at: string | null;
};

/**
 * Only delete audio we no longer need: it must have produced a transcript
 * (otherwise a retry still needs it) and must not already be deleted.
 */
export function findCleanupCandidates(quotes: CleanupCandidate[]): string[] {
  return quotes
    .filter(
      (quote) =>
        quote.audio_path !== null &&
        quote.audio_deleted_at === null &&
        quote.transcript !== null &&
        quote.transcript.trim() !== '',
    )
    .map((quote) => quote.id);
}
