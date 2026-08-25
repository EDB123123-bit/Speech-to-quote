import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export function generateAcceptanceToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashAcceptanceToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export async function issueQuoteAcceptanceToken(
  supabase: SupabaseClient,
  quoteId: string,
): Promise<string> {
  const token = generateAcceptanceToken();
  const { error } = await supabase
    .from('quote_acceptance_tokens')
    .upsert({
      quote_id: quoteId,
      token_hash: hashAcceptanceToken(token),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'quote_id' });

  if (error) throw new Error(`Aanvaardingstoken opslaan mislukt: ${error.message}`);
  return token;
}

export function acceptanceUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/u, '')}/offerte/${encodeURIComponent(token)}`;
}
