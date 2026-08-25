import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { renderSupplierOrderPdf } from '@/lib/pdf/supplier-order-render';
import type { Quote, Supplier, SupplierOrder, SupplierOrderLine } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth: Awaited<ReturnType<typeof requireContractor>>;
  try { auth = await requireContractor(); } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    throw error;
  }
  const { supabase, contractor } = auth;
  const [{ data: order }, { data: lines }] = await Promise.all([
    supabase.from('supplier_orders').select('*').eq('id', id).eq('contractor_id', contractor.id).maybeSingle(),
    supabase.from('supplier_order_lines').select('*').eq('supplier_order_id', id).order('sort_order'),
  ]);
  if (!order) return NextResponse.json({ error: 'Bestelling niet gevonden' }, { status: 404 });
  const typedOrder = order as SupplierOrder;
  const [{ data: supplier }, { data: quote }] = await Promise.all([
    supabase.from('suppliers').select('*').eq('id', typedOrder.supplier_id).eq('contractor_id', contractor.id).maybeSingle(),
    supabase.from('quotes').select('*').eq('id', typedOrder.quote_id).eq('contractor_id', contractor.id).maybeSingle(),
  ]);
  if (!supplier || !quote) return NextResponse.json({ error: 'Bestellingreferentie niet gevonden' }, { status: 404 });

  let bytes: Uint8Array;
  if (typedOrder.status === 'sent') {
    if (!typedOrder.pdf_path || !typedOrder.pdf_sha256) return NextResponse.json({ error: 'De definitieve bestelling-pdf ontbreekt.' }, { status: 409 });
    const { data, error } = await supabase.storage.from('supplier-order-pdfs').download(typedOrder.pdf_path);
    if (error || !data) return NextResponse.json({ error: 'Pdf niet beschikbaar.' }, { status: 404 });
    bytes = new Uint8Array(await data.arrayBuffer());
    const expected = Buffer.from(typedOrder.pdf_sha256, 'hex');
    const actual = createHash('sha256').update(bytes).digest();
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return NextResponse.json({ error: 'De integriteitscontrole van de pdf is mislukt.' }, { status: 409 });
  } else {
    const pdf = await renderSupplierOrderPdf({
      contractor,
      supplier: supplier as Supplier,
      order: typedOrder,
      quote: quote as Quote,
      lines: (lines ?? []) as unknown as SupplierOrderLine[],
    });
    bytes = new Uint8Array(pdf);
  }

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeFilename(typedOrder.order_number)}.pdf"`,
      'Cache-Control': typedOrder.status === 'sent' ? 'private, max-age=31536000, immutable' : 'no-store',
    },
  });
}

function safeFilename(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'bestelling'; }
