import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { transcribeAudio } from '@/lib/ai/transcribe';
import { processClarificationAnswer } from '@/lib/ai/clarify';
import { expandTasksToLineItems } from '@/lib/quotes/expand';
import { nextClarificationState } from '@/lib/clarifications/retry';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import type { CatalogItem, QuoteLineItem } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(
  request: Request,
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

  const form = await request.formData();
  const audio = form.get('audio');
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: 'Geen audio ontvangen' }, { status: 400 });
  }

  const [{ data: clarification }, { data: quote }, { data: catalog }, { data: lineItems }] =
    await Promise.all([
      supabase.from('quote_clarifications').select('*').eq('id', cid).eq('quote_id', id).single(),
      supabase.from('quotes').select('transcript,status').eq('id', id).single(),
      supabase.from('catalog_items').select('*'),
      supabase.from('quote_line_items').select('*').eq('quote_id', id),
    ]);

  if (!clarification || !quote) {
    return NextResponse.json({ error: 'Vraag niet gevonden' }, { status: 404 });
  }
  if (quote.status === 'final') {
    return NextResponse.json({ error: 'Deze offerte is al afgewerkt' }, { status: 409 });
  }

  try {
    const answerTranscript = await transcribeAudio(audio);

    const outcome = await processClarificationAnswer({
      originalTranscript: quote.transcript ?? '',
      question: clarification.question_nl,
      answerTranscript,
      catalog: (catalog ?? []) as CatalogItem[],
      currentLineItems: (lineItems ?? []) as QuoteLineItem[],
    });

    const state = nextClarificationState(
      { retryCount: clarification.retry_count },
      outcome.resolved,
    );

    // Apply any work the answer introduced.
    if (outcome.newTasks.length > 0) {
      const rows = expandTasksToLineItems(outcome.newTasks, (catalog ?? []) as CatalogItem[]);
      await supabase
        .from('quote_line_items')
        .insert(rows.map((row) => ({ ...row, quote_id: id, sort_order: 900 + row.sort_order })));
    }
    for (const update of outcome.updatedLineItems) {
      const patch: Record<string, unknown> = {};
      if (update.quantity !== undefined) patch.quantity = update.quantity;
      if (update.unitPriceCents !== undefined) patch.unit_price_cents = update.unitPriceCents;
      if (Object.keys(patch).length > 0) {
        await supabase.from('quote_line_items').update(patch).eq('id', update.id).eq('quote_id', id);
      }
    }

    const question =
      state.shouldRephrase && outcome.rephrasedQuestionNl
        ? outcome.rephrasedQuestionNl
        : clarification.question_nl;

    await supabase
      .from('quote_clarifications')
      .update({ status: state.status, retry_count: state.retryCount, question_nl: question })
      .eq('id', cid);

    await logPipelineEvent({
      quoteId: id, contractorId, step: 'clarification_answer', status: 'success',
      detail: {
        clarificationId: cid,
        answerTranscript,
        resolved: outcome.resolved,
        retryCount: state.retryCount,
        newTaskCount: outcome.newTasks.length,
      },
    });

    return NextResponse.json({
      resolved: state.status === 'resolved',
      question,
      retryCount: state.retryCount,
      canRetry: state.shouldRephrase,
      answerTranscript,
    });
  } catch (error) {
    await logPipelineEvent({
      quoteId: id, contractorId, step: 'clarification_answer', status: 'error',
      detail: { clarificationId: cid, error: String(error) },
    });
    return NextResponse.json(
      { error: 'Je antwoord kon niet verwerkt worden. Probeer opnieuw of vul het handmatig aan.' },
      { status: 500 },
    );
  }
}
