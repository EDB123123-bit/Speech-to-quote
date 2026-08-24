import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { hashAcceptanceToken } from '@/lib/quotes/acceptance-token';
import { sendMailboxEmail } from '@/lib/mailbox/send';
import { MailboxError } from '@/lib/mailbox/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const admin = createAdminSupabase();
  const { data, error } = await admin.rpc('accept_quote_by_token_hash', {
    p_token_hash: hashAcceptanceToken(token),
  });

  if (error) {
    const code = error.message.includes('quote_not_sent') ? 'quote_not_sent' : 'invalid_acceptance_token';
    return NextResponse.json(
      { error: code === 'quote_not_sent' ? 'Deze offerte kan nog niet aanvaard worden.' : 'Deze aanvaardingslink is ongeldig.' },
      { status: code === 'quote_not_sent' ? 409 : 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result) {
    return NextResponse.json({ error: 'Deze aanvaardingslink is ongeldig.' }, { status: 404, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
  }

  // Email notification is deliberately best effort: acceptance and task
  // activation are already committed transactionally by the RPC.
  if (!result.already_accepted) {
    try {
      const { data: contractor } = await admin
        .from('contractors')
        .select('id,email,company_name')
        .eq('id', result.contractor_id)
        .single();
      if (contractor?.email) {
        await sendMailboxEmail({
          userId: contractor.id,
          to: contractor.email,
          subject: 'Offerte aanvaard',
          message: `${result.customer_name ?? 'De klant'} heeft offerte ${result.quote_number ?? result.quote_id.slice(0, 8)} aanvaard. Bekijk de offerte in Werkoffertes.`,
        });
      }
    } catch (notificationError) {
      if (!(notificationError instanceof MailboxError)) console.error('[quote-acceptance] notification failed', notificationError);
    }
  }

  return NextResponse.json(
    { ok: true, alreadyAccepted: Boolean(result.already_accepted) },
    { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } },
  );
}
