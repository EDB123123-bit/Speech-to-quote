import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { quoteImportEnabled } from '@/lib/quote-imports/constants';
import {
  pollProviderQuoteImport,
  processInteractiveQuoteImport,
  submitProviderQuoteImport,
} from '@/lib/quote-imports/processing';
import type { QuoteImportBatch, QuoteImportDocument } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
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

  const { id } = await context.params;
  const admin = createAdminSupabase();
  const { data } = await admin.from('quote_import_documents')
    .select('*')
    .eq('id', id)
    .eq('contractor_id', contractorId)
    .maybeSingle();
  if (!data) return NextResponse.json({ error: 'Document niet gevonden.' }, { status: 404 });
  const document = data as QuoteImportDocument;
  const { data: batchData } = await admin.from('quote_import_batches')
    .select('*')
    .eq('id', document.batch_id)
    .eq('contractor_id', contractorId)
    .maybeSingle();
  if (!batchData) return NextResponse.json({ error: 'Importbatch niet gevonden.' }, { status: 404 });
  const batch = batchData as QuoteImportBatch;

  try {
    const outcome = batch.processing_mode === 'provider_batch'
      ? document.status === 'processing' && document.provider_batch_id
        ? await pollProviderQuoteImport(document, contractorId)
        : await submitProviderQuoteImport(document.id, contractorId)
      : await processInteractiveQuoteImport(document.id, contractorId);
    return NextResponse.json(outcome);
  } catch (error) {
    const notClaimable = error instanceof Error && error.message.includes('claimable');
    return NextResponse.json({
      error: notClaimable
        ? 'Deze pdf wordt al verwerkt of kan niet opnieuw worden gestart.'
        : 'De pdf kon niet worden verwerkt. Probeer opnieuw.',
    }, { status: notClaimable ? 409 : 502 });
  }
}
