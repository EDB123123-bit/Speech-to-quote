import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { transcribeAudio, TranscriptionError } from '@/lib/ai/transcribe';
import { extractQuoteTasks } from '@/lib/ai/extract';
import { expandTasksToLineItems } from '@/lib/quotes/expand';
import { extractWithCatalogFallback } from '@/lib/quotes/extract-with-fallback';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import { applyHistoricalSuggestions, loadHistoricalPriceCandidates } from '@/lib/quotes/historical-suggestions-server';
import type { Quote, QuoteClarification } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

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

  const [
    { data: quote, error: quoteError },
    { data: lineItems, error: lineItemLoadError },
    { data: clarifications, error: clarificationLoadError },
  ] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', id).eq('contractor_id', contractorId).single(),
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('sort_order'),
    supabase.from('quote_clarifications').select('*').eq('quote_id', id),
  ]);

  if (quoteError) return NextResponse.json({ error: 'Offerte kon niet geladen worden.' }, { status: 500 });
  if (!quote) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });
  if (lineItemLoadError || clarificationLoadError) {
    return NextResponse.json({ error: 'De offertegegevens konden niet volledig geladen worden.' }, { status: 500 });
  }
  if (quote.status !== 'draft') return NextResponse.json({ error: 'Deze offerte is al afgewerkt' }, { status: 409 });
  if ((lineItems ?? []).length > 0) {
    return NextResponse.json({ error: 'Deze offerte heeft al offertelijnen.' }, { status: 409 });
  }

  const typedQuote = quote as Quote;
  let transcript = typedQuote.transcript?.trim() ?? '';
  let transcribedNow = false;

  try {
    if (!transcript) {
      if (!typedQuote.audio_path || typedQuote.audio_deleted_at) {
        return NextResponse.json({ error: 'Deze opname kan niet opnieuw verwerkt worden.' }, { status: 409 });
      }
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json({ error: 'Transcriptie is nog niet ingesteld.' }, { status: 503 });
      }

      const { data: audioBlob, error: downloadError } = await supabase.storage
        .from('quote-audio')
        .download(typedQuote.audio_path);
      if (downloadError || !audioBlob) {
        return NextResponse.json({ error: 'De opname kon niet opnieuw geladen worden.' }, { status: 502 });
      }

      transcript = await transcribeAudio(new File([audioBlob], 'opname.webm', {
        type: audioBlob.type || 'audio/webm',
      }));
      transcribedNow = true;

      const { error: transcriptError } = await supabase.from('quotes').update({ transcript }).eq('id', id);
      if (transcriptError) throw new Error(`Transcript opslaan mislukt: ${transcriptError.message}`);
      await logPipelineEvent({
        quoteId: id,
        contractorId,
        step: 'transcribe',
        status: 'success',
        detail: { transcriptLength: transcript.length, retry: true },
      });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Prijsverwerking is nog niet ingesteld.' }, { status: 503 });
    }

    const outcome = await extractWithCatalogFallback({ transcript, extract: extractQuoteTasks });
    const rows = applyHistoricalSuggestions(
      expandTasksToLineItems(outcome.extraction.tasks),
      await loadHistoricalPriceCandidates(supabase, contractorId, id),
    );

    if (rows.length > 0) {
      const { error: lineItemError } = await supabase
        .from('quote_line_items')
        .insert(rows.map((row) => ({ ...row, quote_id: id })));
      if (lineItemError) throw new Error(`Offertelijnen opslaan mislukt: ${lineItemError.message}`);
    }

    const existingQuestions = new Set(
      ((clarifications ?? []) as QuoteClarification[]).map((item) => item.question_nl.trim().toLowerCase()),
    );
    const newClarifications = outcome.extraction.clarifications.filter(
      (item) => !existingQuestions.has(item.questionNl.trim().toLowerCase()),
    );
    if (newClarifications.length > 0) {
      const { error: clarificationError } = await supabase.from('quote_clarifications').insert(
        newClarifications.map((item) => ({ quote_id: id, question_nl: item.questionNl })),
      );
      if (clarificationError) throw new Error(`Vragen opslaan mislukt: ${clarificationError.message}`);
    }

    await logPipelineEvent({
      quoteId: id,
      contractorId,
      step: 'extract',
      status: outcome.usedFallback ? 'error' : 'success',
      detail: {
        retry: true,
        transcribedNow,
        taskCount: outcome.extraction.tasks.length,
        clarificationCount: newClarifications.length,
        usedFallback: outcome.usedFallback,
        ...(outcome.error ? { error: String(outcome.error) } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      lineItemCount: rows.length,
      clarificationCount: newClarifications.length,
      usedFallback: outcome.usedFallback,
    });
  } catch (error) {
    const step = error instanceof TranscriptionError ? 'transcribe' : 'extract';
    await logPipelineEvent({
      quoteId: id,
      contractorId,
      step,
      status: 'error',
      detail: { retry: true, error: String(error) },
    });
    return NextResponse.json(
      { error: step === 'transcribe' ? 'De opname kon niet opnieuw uitgeschreven worden.' : 'De offerte kon niet opnieuw verwerkt worden.' },
      { status: 502 },
    );
  }
}
