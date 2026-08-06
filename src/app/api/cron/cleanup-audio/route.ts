import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import { findCleanupCandidates, type CleanupCandidate } from '@/lib/storage/cleanup';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminSupabase();
  const { data } = await supabase
    .from('quotes')
    .select('id,contractor_id,audio_path,transcript,audio_deleted_at')
    .is('audio_deleted_at', null)
    .not('audio_path', 'is', null)
    .limit(500);

  const quotes = (data ?? []) as CleanupCandidate[];
  const candidateIds = new Set(findCleanupCandidates(quotes));
  let deleted = 0;

  for (const quote of quotes) {
    if (!candidateIds.has(quote.id) || !quote.audio_path) continue;

    const { error: removeError } = await supabase.storage
      .from('quote-audio')
      .remove([quote.audio_path]);
    if (removeError) {
      await logPipelineEvent({
        quoteId: quote.id, contractorId: quote.contractor_id, step: 'audio_cleanup',
        status: 'error', detail: { path: quote.audio_path, error: removeError.message },
      });
      continue;
    }

    const { error: updateError } = await supabase
      .from('quotes')
      .update({ audio_deleted_at: new Date().toISOString() })
      .eq('id', quote.id);
    if (updateError) {
      await logPipelineEvent({
        quoteId: quote.id, contractorId: quote.contractor_id, step: 'audio_cleanup',
        status: 'error', detail: { path: quote.audio_path, error: updateError.message },
      });
      continue;
    }

    await logPipelineEvent({
      quoteId: quote.id, contractorId: quote.contractor_id, step: 'audio_cleanup',
      status: 'success', detail: { path: quote.audio_path },
    });
    deleted += 1;
  }

  return NextResponse.json({ scanned: quotes.length, deleted });
}
