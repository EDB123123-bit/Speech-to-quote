import type { Quote, QuoteClarification, QuoteLineItem } from '@/lib/supabase/types';

export type FinalizeBlockerCode =
  | 'no_line_items'
  | 'incomplete_line_item'
  | 'pending_clarification'
  | 'missing_customer'
  | 'already_final';

export type FinalizeBlocker = { code: FinalizeBlockerCode; messageNl: string };

function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim() === '';
}

export function checkFinalizeGate(input: {
  quote: Pick<Quote, 'status' | 'customer_name' | 'customer_address'>;
  lineItems: QuoteLineItem[];
  clarifications: QuoteClarification[];
}): FinalizeBlocker[] {
  const blockers: FinalizeBlocker[] = [];

  if (input.quote.status === 'final') {
    blockers.push({ code: 'already_final', messageNl: 'Deze offerte is al afgewerkt.' });
  }

  if (input.lineItems.length === 0) {
    blockers.push({ code: 'no_line_items', messageNl: 'Voeg minstens één offertelijn toe.' });
  }

  const incomplete = input.lineItems.filter(
    (item) => item.unit_price_cents === null || item.vat_rate === null,
  );
  if (incomplete.length > 0) {
    blockers.push({
      code: 'incomplete_line_item',
      messageNl: `${incomplete.length} offertelijn(en) missen nog een prijs of btw-tarief.`,
    });
  }

  const pending = input.clarifications.filter((item) => item.status === 'pending');
  if (pending.length > 0) {
    blockers.push({
      code: 'pending_clarification',
      messageNl: `Er zijn nog ${pending.length} openstaande vraag/vragen. Beantwoord of verwerp ze eerst.`,
    });
  }

  if (isBlank(input.quote.customer_name) || isBlank(input.quote.customer_address)) {
    blockers.push({
      code: 'missing_customer',
      messageNl: 'Vul de naam en het adres van de klant in.',
    });
  }

  return blockers;
}
