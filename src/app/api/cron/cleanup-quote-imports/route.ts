import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { pollProviderQuoteImport } from '@/lib/quote-imports/processing';
import type { QuoteImportDocument } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc('claim_quote_import_cleanup', { p_limit: 25 });
  if (error) return NextResponse.json({ error: 'Cleanup claim failed' }, { status: 500 });
  const documents = (data ?? []) as QuoteImportDocument[];
  let deleted = 0;
  for (const document of documents) {
    if (!document.storage_path) continue;
    const { error: removeError } = await admin.storage.from('quote-imports').remove([document.storage_path]);
    await admin.rpc('record_quote_import_source_deleted', {
      p_document_id: document.id,
      p_success: !removeError,
      p_error_message: removeError?.message ?? null,
    });
    if (!removeError) deleted += 1;
  }
  let providerPolled = 0;
  if (process.env.ANTHROPIC_API_KEY) {
    const { data: providerDocuments } = await admin.from('quote_import_documents')
      .select('*')
      .eq('status', 'processing')
      .in('provider_batch_status', ['in_progress', 'canceling', 'ended'])
      .not('provider_batch_id', 'is', null)
      .limit(25);
    const providerResults = await Promise.allSettled(
      ((providerDocuments ?? []) as QuoteImportDocument[]).map((document) =>
        pollProviderQuoteImport(document, document.contractor_id)),
    );
    providerPolled = providerResults.length;
  }
  return NextResponse.json({ scanned: documents.length, deleted, providerPolled });
}
