import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { MailboxError } from '@/lib/mailbox/errors';
import { sendMailboxEmail } from '@/lib/mailbox/send';
import { renderSupplierOrderPdf } from '@/lib/pdf/supplier-order-render';
import { createAdminSupabase } from '@/lib/supabase/admin';
import type { Quote, Supplier, SupplierOrder, SupplierOrderLine } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const inputSchema = z.object({
  recipient: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value)),
  message: z.string().trim().min(1).max(10_000),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let auth: Awaited<ReturnType<typeof requireContractor>>;
  try { auth = await requireContractor(); } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    throw error;
  }
  let json: unknown;
  try { json = await request.json(); } catch { return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 }); }
  const parsed = inputSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: 'Controleer ontvanger, onderwerp en bericht.' }, { status: 422 });

  const { supabase, contractor } = auth;
  const [{ data: order }, { data: lines }] = await Promise.all([
    supabase.from('supplier_orders').select('*').eq('id', id).eq('contractor_id', contractor.id).maybeSingle(),
    supabase.from('supplier_order_lines').select('*').eq('supplier_order_id', id).order('sort_order'),
  ]);
  if (!order) return NextResponse.json({ error: 'Bestelling niet gevonden.' }, { status: 404 });
  const typedOrder = order as SupplierOrder;
  if (typedOrder.status === 'sent') return NextResponse.json({ ok: true, status: 'sent', alreadySent: true });
  if (typedOrder.cancelled_at) return NextResponse.json({ error: 'Een geannuleerde bestelling kan niet verstuurd worden.' }, { status: 409 });
  if (!lines || lines.length === 0) return NextResponse.json({ error: 'Voeg minstens één bestellijn toe.' }, { status: 409 });

  const [{ data: supplier }, { data: quote }] = await Promise.all([
    supabase.from('suppliers').select('*').eq('id', typedOrder.supplier_id).eq('contractor_id', contractor.id).maybeSingle(),
    supabase.from('quotes').select('*').eq('id', typedOrder.quote_id).eq('contractor_id', contractor.id).maybeSingle(),
  ]);
  if (!supplier || !quote) return NextResponse.json({ error: 'Bestellingreferentie niet gevonden.' }, { status: 404 });
  if (!supplier.email) return NextResponse.json({ error: 'De leverancier heeft geen e-mailadres.' }, { status: 422 });

  try {
    const pdf = await renderSupplierOrderPdf({
      contractor,
      supplier: supplier as Supplier,
      order: typedOrder,
      quote: quote as Quote,
      lines: lines as unknown as SupplierOrderLine[],
    });
    const bytes = new Uint8Array(pdf);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const path = `${contractor.id}/${typedOrder.id}.pdf`;
    const admin = createAdminSupabase();
    const { error: uploadError } = await admin.storage.from('supplier-order-pdfs').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const result = await sendMailboxEmail({
      userId: contractor.id,
      to: parsed.data.recipient,
      subject: parsed.data.subject,
      message: parsed.data.message,
      attachment: { filename: `${typedOrder.order_number}.pdf`, contentType: 'application/pdf', content: bytes },
    });
    const { error: markError } = await admin.rpc('mark_supplier_order_sent', {
      p_order_id: typedOrder.id,
      p_contractor_id: contractor.id,
      p_pdf_path: path,
      p_pdf_sha256: hash,
      p_email_subject: parsed.data.subject,
      p_email_body: parsed.data.message,
      p_provider_message_id: result.messageId,
    });
    if (markError) throw new Error(`Verzendstatus opslaan mislukt: ${markError.message}`);
    revalidatePath('/bestellingen');
    revalidatePath(`/bestellingen/${typedOrder.id}`);
    revalidatePath('/te-bestellen');
    return NextResponse.json({ ok: true, status: 'sent', provider: result.provider, from: result.from });
  } catch (error) {
    if (error instanceof MailboxError) {
      const status = error.code === 'provider_failed' ? 502 : error.code === 'configuration' ? 503 : 409;
      return NextResponse.json({ error: error.message }, { status });
    }
    console.error('[supplier-order-email] send failed', error);
    return NextResponse.json({ error: 'De bestelling kon niet verstuurd worden. Probeer opnieuw.' }, { status: 500 });
  }
}
