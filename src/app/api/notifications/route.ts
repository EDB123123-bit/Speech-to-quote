import { NextResponse } from 'next/server';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import type { ContractorNotification } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { supabase, contractor } = await requireContractor();
    const { data, error } = await supabase
      .from('contractor_notifications')
      .select('id,contractor_id,quote_id,notification_type,title,body,href,read_at,created_at')
      .eq('contractor_id', contractor.id)
      .order('created_at', { ascending: false })
      .limit(12);
    if (error) return NextResponse.json({ error: 'Meldingen laden mislukt.' }, { status: 500 });
    return NextResponse.json({ notifications: (data ?? []) as ContractorNotification[] }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    throw error;
  }
}

export async function PATCH(request: Request) {
  try {
    const { supabase, contractor } = await requireContractor();
    const body = (await request.json()) as { id?: string };
    if (!body.id) return NextResponse.json({ error: 'Melding ontbreekt.' }, { status: 400 });
    const { error } = await supabase
      .from('contractor_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', body.id)
      .eq('contractor_id', contractor.id);
    if (error) return NextResponse.json({ error: 'Melding bijwerken mislukt.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    throw error;
  }
}
