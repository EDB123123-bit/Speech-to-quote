import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { sendQuoteEmail } from '@/lib/mailbox/send';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth: Awaited<ReturnType<typeof requireContractor>>;
  try { auth = await requireContractor(); } catch (error) { if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 }); throw error; }
  const { supabase, contractor } = auth;
  const body = await request.json() as { recipient?: string; subject?: string; message?: string };
  if (!body.recipient || !body.subject || !body.message) return NextResponse.json({ error: 'Vul ontvanger, onderwerp en bericht in.' }, { status: 422 });
  const { data: invoice } = await supabase.from('invoices').select('*').eq('id', id).single();
  if (!invoice || invoice.status === 'draft' || invoice.customer_type !== 'private' || !invoice.pdf_path) return NextResponse.json({ error: 'Deze factuur kan niet per e-mail verstuurd worden.' }, { status: 409 });
  const { data: pdf, error } = await supabase.storage.from('invoice-documents').download(invoice.pdf_path);
  if (error || !pdf) return NextResponse.json({ error: 'Pdf niet beschikbaar.' }, { status: 404 });
  const pdfBytes = Buffer.from(await pdf.arrayBuffer());
  const expectedHash = Buffer.from(invoice.pdf_sha256 ?? '', 'hex');
  const actualHash = createHash('sha256').update(pdfBytes).digest();
  if (expectedHash.length !== actualHash.length || !timingSafeEqual(expectedHash, actualHash)) {
    return NextResponse.json({ error: 'De integriteitscontrole van de pdf is mislukt.' }, { status: 409 });
  }
  try {
    const result = await sendQuoteEmail({ userId: contractor.id, to: body.recipient, subject: body.subject, message: body.message, pdf: pdfBytes, filename: `${invoice.invoice_number}.pdf` });
    const { error: recordError } = await supabase.rpc('record_manual_delivery', {
      p_invoice_id: id, p_transport_status: 'delivered', p_business_response_status: null,
      p_external_reference: `${result.provider}:${result.messageId}`, p_receipt_path: null, p_receipt_sha256: null,
    });
    if (recordError) throw recordError;
    return NextResponse.json({ ok: true, from: result.from });
  } catch (sendError) { return NextResponse.json({ error: sendError instanceof Error ? sendError.message : 'Versturen mislukt.' }, { status: 502 }); }
}
import { createHash, timingSafeEqual } from 'node:crypto';
