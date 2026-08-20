import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth: Awaited<ReturnType<typeof requireContractor>>;
  try { auth = await requireContractor(); } catch (error) { if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 }); throw error; }
  const { supabase } = auth;
  const { data: invoice } = await supabase.from('invoices').select('delivery_receipt_path,delivery_receipt_sha256').eq('id', id).single();
  if (!invoice?.delivery_receipt_path) return NextResponse.json({ error: 'Ontvangstbewijs niet beschikbaar.' }, { status: 404 });
  const { data, error } = await supabase.storage.from('invoice-documents').download(invoice.delivery_receipt_path);
  if (error || !data) return NextResponse.json({ error: 'Ontvangstbewijs niet beschikbaar.' }, { status: 404 });
  const bytes = Buffer.from(await data.arrayBuffer());
  const expected = Buffer.from(invoice.delivery_receipt_sha256 ?? '', 'hex');
  const actual = createHash('sha256').update(bytes).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return NextResponse.json({ error: 'De integriteitscontrole van het ontvangstbewijs is mislukt.' }, { status: 409 });
  return new NextResponse(bytes, { headers: { 'Content-Type': data.type || 'application/octet-stream', 'Content-Disposition': 'attachment', 'Cache-Control': 'private, no-store' } });
}
import { createHash, timingSafeEqual } from 'node:crypto';
