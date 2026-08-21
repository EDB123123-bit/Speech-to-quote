import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { quoteImportEnabled } from '@/lib/quote-imports/constants';
import { pollProviderQuoteImport, submitProviderQuoteImport } from '@/lib/quote-imports/processing';
import type { QuoteImportBatch, QuoteImportDocument } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  if (!quoteImportEnabled()) return NextResponse.json({ error: 'Pdf-import is uitgeschakeld.' }, { status: 404 });
  let contractorId: string;
  try {
    contractorId = (await requireContractor()).contractor.id;
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    throw error;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Documentextractie is niet geconfigureerd.' }, { status: 503 });
  }

  const { batchId } = await context.params;
  const admin = createAdminSupabase();
  const [{ data: batchData }, { data: documentData }] = await Promise.all([
    admin.from('quote_import_batches').select('*').eq('id', batchId).eq('contractor_id', contractorId).maybeSingle(),
    admin.from('quote_import_documents').select('*').eq('batch_id', batchId).eq('contractor_id', contractorId).order('created_at'),
  ]);
  if (!batchData) return NextResponse.json({ error: 'Importbatch niet gevonden.' }, { status: 404 });
  const batch = batchData as QuoteImportBatch;
  if (batch.processing_mode !== 'provider_batch') {
    return NextResponse.json({ error: 'Deze import gebruikt geen batchverwerking.' }, { status: 409 });
  }
  if (batch.file_count !== batch.requested_quote_count) {
    return NextResponse.json({ error: 'Nog niet alle gekozen pdf’s zijn geüpload.' }, { status: 409 });
  }

  const documents = (documentData ?? []) as QuoteImportDocument[];
  const submissionCandidates = documents.filter((document) => document.status === 'uploaded' || (
    document.status === 'processing'
    && document.provider_batch_status === 'submitting'
    && !document.provider_batch_id
    && document.locked_until !== null
    && new Date(document.locked_until).getTime() < Date.now()
  ));
  const pending = submissionCandidates;
  const active = documents.filter((document) =>
    document.status === 'processing'
    && document.provider_batch_id);
  const submitted = await mapWithConcurrency(pending, 2, (document) =>
    submitProviderQuoteImport(document.id, contractorId));
  const polled = await mapWithConcurrency(active, 5, (document) =>
    pollProviderQuoteImport(document, contractorId));

  return NextResponse.json({
    submitted: submitted.length,
    polled: polled.length,
    remaining: 0,
  });
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(values.length);
  let cursor = 0;
  async function run() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = { status: 'fulfilled', value: await worker(values[index]) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => run()));
  return results;
}
