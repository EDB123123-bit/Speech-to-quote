import type { NextRequest } from 'next/server';
import { handleMailboxOAuth } from '@/lib/mailbox/oauth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<Response> {
  return handleMailboxOAuth(request, 'outlook');
}
