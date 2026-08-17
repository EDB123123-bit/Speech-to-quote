import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { transcribeAudio, TranscriptionError } from '@/lib/ai/transcribe';
import { extractQuoteTasks, ExtractionError } from '@/lib/ai/extract';
import { logPipelineEvent } from '@/lib/logging/pipeline-events';
import { generateQuote, EmptyCatalogError, PartialQuoteError, type GenerateDeps } from '@/lib/quotes/generate';
import type { CatalogItem } from '@/lib/supabase/types';

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

  const deps: GenerateDeps = {
    loadCatalog: async () => {
      const { data, error } = await supabase.from('catalog_items').select('*');
      if (error) throw new Error(`Prijslijst laden mislukt: ${error.message}`);
      return (data ?? []) as CatalogItem[];
    },
    uploadAudio: async (id, file) => {
      const path = `${id}/${crypto.randomUUID()}.webm`;
      const { error } = await supabase.storage.from('quote-audio').upload(path, file);
      if (error) throw new Error(`Upload mislukt: ${error.message}`);
      return path;
    },
    createDraftQuote: async (id, audioPath) => {
      const { data, error } = await supabase
        .from('quotes')
        .insert({ contractor_id: id, audio_path: audioPath, status: 'draft' })
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
    const { quoteId } = await generateQuote(deps, { audio, contractorId });
    return NextResponse.json({ quoteId }, { status: 201 });
  } catch (error) {
    console.error('[quotes/generate] verwerking mislukt', error);
    if (error instanceof TranscriptionError) {
      return NextResponse.json(
        { error: 'Transcriptie mislukt. Controleer je OpenAI-verbinding en probeer opnieuw.' },
        { status: 502 },
      );
    }
    if (error instanceof EmptyCatalogError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof PartialQuoteError) {
      const extractionFailed = error.stage === 'extract' || error.cause instanceof ExtractionError;
      return NextResponse.json(
        {
          error: extractionFailed
            ? 'De opname is bewaard. De prijslijst kon nog niet automatisch worden toegepast; probeer opnieuw.'
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
