import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { logPipelineEvent, serialiseError } from '@/lib/logging/pipeline-events';
import { MailboxError } from '@/lib/mailbox/errors';
import { sendQuoteEmail } from '@/lib/mailbox/send';
import { getOrCreateQuotePdf } from '@/lib/pdf/get-or-create';
import type { Quote } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const inputSchema = z.object({
  recipient: z.string().trim().email().max(320),
  subject: z.string().trim().min(1).max(200).refine((value) => !/[\r\n]/.test(value)),
  message: z.string().trim().min(1).max(10_000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let auth: Awaited<ReturnType<typeof requireContractor>>;
  try {
    auth = await requireContractor();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    }
    throw error;
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 });
  }

  const parsed = inputSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Controleer het e-mailadres, onderwerp en bericht.' },
      { status: 422 },
    );
  }

  const { data } = await auth.supabase.from('quotes').select('*').eq('id', id).single();
  if (!data) return NextResponse.json({ error: 'Offerte niet gevonden' }, { status: 404 });

  const quote = data as Quote;
  if (quote.status !== 'final') {
    return NextResponse.json(
      { error: 'Werk de offerte eerst af voordat je ze verstuurt.' },
      { status: 409 },
    );
  }

  try {
    const { pdf } = await getOrCreateQuotePdf({
      supabase: auth.supabase,
      contractor: auth.contractor,
      quote,
    });
    const result = await sendQuoteEmail({
      userId: auth.contractor.id,
      to: parsed.data.recipient,
      subject: parsed.data.subject,
      message: parsed.data.message,
      pdf,
      filename: `offerte-${quote.id.slice(0, 8)}.pdf`,
    });

    await logPipelineEvent({
      quoteId: quote.id,
      contractorId: auth.contractor.id,
      step: 'email_send',
      status: 'success',
      detail: {
        recipient: parsed.data.recipient,
        provider: result.provider,
        from: result.from,
        messageId: result.messageId,
      },
    });

    return NextResponse.json({
      ok: true,
      provider: result.provider,
      from: result.from,
    });
  } catch (error) {
    await logPipelineEvent({
      quoteId: quote.id,
      contractorId: auth.contractor.id,
      step: 'email_send',
      status: 'error',
      detail: serialiseError(error),
    });

    if (error instanceof MailboxError) {
      const status = error.code === 'provider_failed'
        ? 502
        : error.code === 'configuration'
          ? 503
          : 409;
      const message = error.code === 'configuration'
        ? 'De mailboxprovider is nog niet geconfigureerd.'
        : error.message;
      return NextResponse.json({ error: message }, { status });
    }

    console.error('[quote-email] send failed', error);
    return NextResponse.json(
      { error: 'De offerte kon niet verstuurd worden. Probeer opnieuw.' },
      { status: 500 },
    );
  }
}
