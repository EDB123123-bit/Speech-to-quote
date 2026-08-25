import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { transcribeAudio, TranscriptionError } from '@/lib/ai/transcribe';
import { extractQuoteTasks, ExtractionError } from '@/lib/ai/extract';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import { generateQuote, PartialQuoteError, type GenerateDeps } from '@/lib/quotes/generate';
import { applyHistoricalSuggestions, loadHistoricalPriceCandidates } from '@/lib/quotes/historical-suggestions-server';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request) {
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

  if (!process.env.OPENAI_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Spraakverwerking is nog niet ingesteld. Voeg de OpenAI- en Anthropic-sleutel toe aan .env.local.' },
      { status: 503 },
    );
  }

  const form = await request.formData();
  const audio = form.get('audio');
  if (!(audio instanceof File) || audio.size === 0) {
    return NextResponse.json({ error: 'Geen audio ontvangen' }, { status: 400 });
  }

  const rawParentQuoteId = String(form.get('parentQuoteId') ?? '').trim();
  const parentQuoteId = rawParentQuoteId || null;
  if (parentQuoteId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(parentQuoteId)) {
    return NextResponse.json({ error: 'Ongeldige oorspronkelijke offerte.' }, { status: 422 });
  }

  const deps: GenerateDeps = {
    uploadAudio: async (id, file) => {
      const path = `${id}/${crypto.randomUUID()}.webm`;
      const { error } = await supabase.storage.from('quote-audio').upload(path, file);
      if (error) throw new Error(`Upload mislukt: ${error.message}`);
      return path;
    },
    createDraftQuote: async (id, audioPath, parentId) => {
      if (parentId) {
        const admin = createAdminSupabase();
        const { data, error } = await admin.rpc('create_meerwerk_quote', {
          p_parent_quote_id: parentId,
          p_contractor_id: id,
        });
        if (error || !data) throw new Error(`Meerwerkofferte aanmaken mislukt${error ? `: ${error.message}` : ''}`);
        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.quote_id) throw new Error('Meerwerkofferte aanmaken mislukt.');
        const { error: audioError } = await admin.from('quotes').update({ audio_path: audioPath }).eq('id', row.quote_id).eq('status', 'draft');
        if (audioError) throw new Error(`Audio aan meerwerkofferte koppelen mislukt: ${audioError.message}`);
        return row.quote_id as string;
      }
      const { data, error } = await supabase
        .from('quotes')
        .insert({ contractor_id: id, audio_path: audioPath, status: 'draft', source: 'voice' })
        .select('id')
        .single();
      if (error || !data) throw new Error(`Aanmaken van offerte mislukt${error ? `: ${error.message}` : ''}`);
      return data.id as string;
    },
    transcribe: transcribeAudio,
    extract: extractQuoteTasks,
    saveTranscript: async (quoteId, transcript) => {
      const { error } = await supabase.from('quotes').update({ transcript }).eq('id', quoteId);
      if (error) throw new Error('Opslaan van transcript mislukt');
    },
    saveLineItems: async (quoteId, rows) => {
      if (rows.length === 0) return;
      const { error } = await supabase
        .from('quote_line_items')
        .insert(rows.map((row) => ({ ...row, quote_id: quoteId })));
      if (error) throw new Error('Opslaan van offertelijnen mislukt');
    },
    suggestLineItems: async (quoteId, rows) => {
      const candidates = await loadHistoricalPriceCandidates(supabase, contractorId, quoteId);
      return applyHistoricalSuggestions(rows, candidates) as typeof rows;
    },
    saveClarifications: async (quoteId, items) => {
      if (items.length === 0) return;
      const { error } = await supabase
        .from('quote_clarifications')
        .insert(items.map((item) => ({ quote_id: quoteId, question_nl: item.questionNl })));
      if (error) throw new Error('Opslaan van vragen mislukt');
    },
    log: logPipelineEvent,
  };

  try {
    const { quoteId } = await generateQuote(deps, { audio, contractorId, parentQuoteId });
    return NextResponse.json({ quoteId }, { status: 201 });
  } catch (error) {
    console.error('[quotes/generate] verwerking mislukt', error);
    if (error instanceof TranscriptionError) {
      return NextResponse.json(
        { error: 'Transcriptie mislukt. Controleer je OpenAI-verbinding en probeer opnieuw.' },
        { status: 502 },
      );
    }
    if (error instanceof PartialQuoteError) {
      const extractionFailed = error.stage === 'extract' || error.cause instanceof ExtractionError;
      return NextResponse.json(
        {
          error: extractionFailed
            ? 'De opname is bewaard. De werken konden nog niet automatisch worden verwerkt; probeer opnieuw.'
            : 'De opname is bewaard, maar kon nog niet worden uitgeschreven. Probeer opnieuw.',
          quoteId: error.quoteId,
        },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: 'Er ging iets mis bij het verwerken van je opname. Probeer opnieuw.' },
      { status: 500 },
    );
  }
}
