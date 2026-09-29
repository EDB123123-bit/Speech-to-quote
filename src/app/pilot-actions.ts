'use server';

import { after } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/admin';
import {
  parsePilotRequest,
  pilotNotificationText,
  toPilotRow,
  type PilotField,
} from '@/lib/pilot/request';

export type PilotFormState =
  | { status: 'idle' }
  | { status: 'invalid'; fieldErrors: Partial<Record<PilotField, string>> }
  | { status: 'failed' }
  | { status: 'sent'; firstName: string };

/**
 * Public, unauthenticated: stores a pilot request from the landing page.
 * Only the service role can read or write `pilot_requests`.
 */
export async function requestPilot(_previous: PilotFormState, formData: FormData): Promise<PilotFormState> {
  // People never see the `website` field; bots fill it. Pretend it worked.
  const honeypot = formData.get('website');
  if (typeof honeypot === 'string' && honeypot.trim() !== '') return { status: 'sent', firstName: '' };

  const parsed = parsePilotRequest(formData);
  if (!parsed.ok) return { status: 'invalid', fieldErrors: parsed.fieldErrors };

  try {
    const { error } = await createAdminSupabase().from('pilot_requests').insert(toPilotRow(parsed.data));
    if (error) throw new Error(error.message);
  } catch (error) {
    // No personal data in the log line: the visitor is shown a WhatsApp fallback instead.
    console.error('[pilot] request could not be stored:', error instanceof Error ? error.message : 'unknown error');
    return { status: 'failed' };
  }

  const webhookUrl = process.env.PILOT_LEAD_WEBHOOK_URL?.trim();
  if (webhookUrl) {
    after(async () => {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: pilotNotificationText(parsed.data) }),
        });
      } catch {
        // The request is already stored; a missed chat ping must not fail the visitor.
      }
    });
  }

  return { status: 'sent', firstName: parsed.data.name.split(' ')[0] };
}
