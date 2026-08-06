import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { synthesizeDutchSpeech } from '@/lib/ai/tts';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; cid: string }> },
) {
  const { id, cid } = await params;

  let contractorId: string;
  let supabase: Awaited<ReturnType<typeof requireContractor>>['supabase'];
  try {
    const auth = await requireContractor();
    contractorId = auth.contractor.id;
    supabase = auth.supabase;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    }
    throw error;
  }

  // RLS already scopes this to the caller; the quote_id filter guards against
  // a clarification id from a different quote being passed in.
  const { data: clarification } = await supabase
    .from('quote_clarifications')
    .select('question_nl')
    .eq('id', cid)
    .eq('quote_id', id)
    .single();

  if (!clarification) {
    return NextResponse.json({ error: 'Vraag niet gevonden' }, { status: 404 });
  }

  try {
    const audio = await synthesizeDutchSpeech(clarification.question_nl);
    await logPipelineEvent({
      quoteId: id, contractorId, step: 'tts_generate', status: 'success',
      detail: { clarificationId: cid },
    });

    return new NextResponse(audio, {
      status: 200,
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    await logPipelineEvent({
      quoteId: id, contractorId, step: 'tts_generate', status: 'error',
      detail: { clarificationId: cid, error: String(error) },
    });
    return NextResponse.json({ error: 'Spraakgeneratie mislukt' }, { status: 500 });
  }
}
