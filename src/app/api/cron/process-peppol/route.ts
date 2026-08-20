import { NextResponse } from 'next/server';
import { processPeppolOutbox } from '@/lib/peppol/outbox';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(await processPeppolOutbox());
}
