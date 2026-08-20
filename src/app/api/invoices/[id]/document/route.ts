import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';

export const runtime = 'nodejs';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const type = new URL(request.url).searchParams.get('type') === 'ubl' ? 'ubl' : 'pdf';
  let auth: Awaited<ReturnType<typeof requireContractor>>;
  try { auth = await requireContractor(); } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    throw error;
  }
  const { supabase } = auth;
  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', id).single();
  if (!invoice || invoice.status === 'draft') return NextResponse.json({ error: 'Document niet beschikbaar.' }, { status: 404 });
  const path = type === 'ubl' ? invoice.ubl_path : invoice.pdf_path;
  if (!path) return NextResponse.json({ error: 'Document wordt nog gegenereerd.' }, { status: 404 });
  const { data, error } = await supabase.storage.from('invoice-documents').download(path);
  if (error || !data) return NextResponse.json({ error: 'Document niet beschikbaar.' }, { status: 404 });
  const bytes = Buffer.from(await data.arrayBuffer());
  const expectedHash = type === 'ubl' ? invoice.ubl_sha256 : invoice.pdf_sha256;
  const actualHash = createHash('sha256').update(bytes).digest();
  if (!expectedHash || expectedHash.length !== 64 || !timingSafeEqual(actualHash, Buffer.from(expectedHash, 'hex'))) {
    return NextResponse.json({ error: 'De integriteitscontrole van het document is mislukt.' }, { status: 409 });
  }
  return new NextResponse(bytes, {
    headers: {
      'Content-Type': type === 'ubl' ? 'application/xml; charset=utf-8' : 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.invoice_number}.${type === 'ubl' ? 'xml' : 'pdf'}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
import { createHash, timingSafeEqual } from 'node:crypto';
