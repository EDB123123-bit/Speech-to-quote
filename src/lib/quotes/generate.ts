import { expandTasksToLineItems, type NewLineItem } from '@/lib/quotes/expand';
import type { ExtractionResult } from '@/lib/ai/schemas';
import type { CatalogItem, PipelineStep } from '@/lib/supabase/types';

export class EmptyCatalogError extends Error {
  constructor() {
    super('Voeg eerst minstens één item toe aan je prijslijst.');
    this.name = 'EmptyCatalogError';
  }
}

/** Thrown when a draft exists but extraction failed — the caller needs the id. */
export class PartialQuoteError extends Error {
  quoteId: string;
  constructor(message: string, quoteId: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PartialQuoteError';
    this.quoteId = quoteId;
  }
}

/** Surfaces `error.cause` too — the underlying SDK/API error is otherwise swallowed in logs. */
function errorDetail(error: unknown): { error: string; cause?: string } {
  const cause = error instanceof Error && error.cause instanceof Error ? String(error.cause) : undefined;
  return cause ? { error: String(error), cause } : { error: String(error) };
}

export type GenerateDeps = {
  loadCatalog: (contractorId: string) => Promise<CatalogItem[]>;
  uploadAudio: (contractorId: string, audio: File) => Promise<string>;
  createDraftQuote: (contractorId: string, audioPath: string) => Promise<string>;
  transcribe: (audio: File) => Promise<string>;
  extract: (transcript: string, catalog: CatalogItem[]) => Promise<ExtractionResult>;
  saveTranscript: (quoteId: string, transcript: string) => Promise<void>;
  saveLineItems: (quoteId: string, rows: NewLineItem[]) => Promise<void>;
  saveClarifications: (quoteId: string, items: { questionNl: string }[]) => Promise<void>;
  log: (event: {
    quoteId: string | null;
    contractorId: string;
    step: PipelineStep;
    status: 'success' | 'error';
    detail?: Record<string, unknown>;
  }) => Promise<void>;
};

export async function generateQuote(
  deps: GenerateDeps,
  args: { audio: File; contractorId: string },
): Promise<{ quoteId: string }> {
  const { contractorId, audio } = args;

  const catalog = await deps.loadCatalog(contractorId);
  if (catalog.length === 0) throw new EmptyCatalogError();

  // --- upload -------------------------------------------------------------
  let audioPath: string;
  try {
    audioPath = await deps.uploadAudio(contractorId, audio);
    await deps.log({ quoteId: null, contractorId, step: 'upload', status: 'success', detail: { audioPath } });
  } catch (error) {
    await deps.log({ quoteId: null, contractorId, step: 'upload', status: 'error', detail: errorDetail(error) });
    throw error;
  }

  const quoteId = await deps.createDraftQuote(contractorId, audioPath);

  // --- transcribe ---------------------------------------------------------
  let transcript: string;
  try {
    transcript = await deps.transcribe(audio);
    await deps.log({
      quoteId, contractorId, step: 'transcribe', status: 'success',
      detail: { transcriptLength: transcript.length, transcript },
    });
  } catch (error) {
    await deps.log({ quoteId, contractorId, step: 'transcribe', status: 'error', detail: errorDetail(error) });
    throw error;
  }

  // Not a distinct pipeline step in its own right — logged under 'transcribe'
  // (with a phase marker) since it persists that step's output and shares
  // its PipelineStep enum value rather than adding a new DB-level step.
  try {
    await deps.saveTranscript(quoteId, transcript);
  } catch (error) {
    await deps.log({
      quoteId, contractorId, step: 'transcribe', status: 'error',
      detail: { phase: 'save_transcript', ...errorDetail(error) },
    });
    throw error;
  }

  // --- extract ------------------------------------------------------------
  let extraction: ExtractionResult;
  try {
    extraction = await deps.extract(transcript, catalog);
    await deps.log({
      quoteId, contractorId, step: 'extract', status: 'success',
      detail: { taskCount: extraction.tasks.length, clarificationCount: extraction.clarifications.length },
    });
  } catch (error) {
    await deps.log({ quoteId, contractorId, step: 'extract', status: 'error', detail: errorDetail(error) });
    // The draft survives: the contractor can still build the quote by hand
    // rather than losing the recording they just made.
    throw new PartialQuoteError('Automatische verwerking mislukt', quoteId, { cause: error });
  }

  await deps.saveLineItems(quoteId, expandTasksToLineItems(extraction.tasks, catalog));
  await deps.saveClarifications(quoteId, extraction.clarifications);

  return { quoteId };
}
