import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { quoteImportEnabled } from '@/lib/quote-imports/constants';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!quoteImportEnabled()) return NextResponse.json({ error: 'Niet gevonden' }, { status: 404 });
  try {
    const { supabase } = await requireContractor();
    const { id } = await context.params;
    const { data: document } = await supabase.from('quote_import_documents')
      .select('storage_path,original_filename').eq('id', id).single();
    if (!document?.storage_path) return NextResponse.json({ error: 'Bronbestand is verwijderd.' }, { status: 404 });
    const { data, error } = await supabase.storage.from('quote-imports').download(document.storage_path);
    if (error || !data) return NextResponse.json({ error: 'Pdf kon niet worden geladen.' }, { status: 404 });
    return new Response(data, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${document.original_filename.replace(/["\\]/gu, '_')}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    throw error;
  }
}
