import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { listGmailMessages } from '@/lib/mailbox/gmail';
import { MailboxError } from '@/lib/mailbox/errors';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  let contractorId: string;
  try {
    contractorId = (await requireContractor()).contractor.id;
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    throw error;
  }
  const query = new URL(request.url).searchParams.get('q')?.trim().slice(0, 200) || undefined;
  try {
    return NextResponse.json({ messages: await listGmailMessages(contractorId, query) });
  } catch (error) {
    if (error instanceof MailboxError) {
      const status = error.code === 'gmail_read_not_connected' ? 409 : error.code === 'not_connected' ? 503 : 502;
      return NextResponse.json({ error: error.message, code: error.code, reconnect: error.code === 'gmail_read_not_connected' }, { status });
    }
    console.error('[gmail:list] failed', error);
    return NextResponse.json({ error: 'Gmail kon niet worden geladen.' }, { status: 502 });
  }
}
