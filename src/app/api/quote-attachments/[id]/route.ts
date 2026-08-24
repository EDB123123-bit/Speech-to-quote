import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { createAdminSupabase } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  let auth: Awaited<ReturnType<typeof requireContractor>>;
  try { auth = await requireContractor(); } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    throw error;
  }
  const { id } = await context.params;
  const { data: attachment } = await auth.supabase.from('quote_attachments').select('*').eq('id', id).eq('contractor_id', auth.contractor.id).maybeSingle();
  if (!attachment) return NextResponse.json({ error: 'Bijlage niet gevonden.' }, { status: 404 });
  const { data, error } = await createAdminSupabase().storage.from('quote-attachments').download(attachment.storage_path);
  if (error || !data) return NextResponse.json({ error: 'Bijlage niet beschikbaar.' }, { status: 404 });
  return new NextResponse(data, {
    headers: {
      'Content-Type': attachment.mime_type,
      'Content-Disposition': `attachment; filename="${attachment.filename.replace(/["\\]/gu, '_')}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
