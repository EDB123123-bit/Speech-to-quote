import { normalizeUnitCode } from '@/lib/invoices/constants';
import { invoiceLineTotalCents } from '@/lib/invoices/totals';
import type { InvoiceVatCategory, InvoiceVatRate } from '@/lib/supabase/types';

function requiredText(form: FormData, key: string, message: string): string {
  const value = form.get(key);
  if (typeof value !== 'string' || value.trim() === '') throw new Error(message);
  return value.trim();
}

function nullableText(form: FormData, key: string): string | null {
  const value = form.get(key);
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requiredNumber(form: FormData, key: string, message: string): number {
  const raw = requiredText(form, key, message);
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(message);
  return value;
}

export function parseInvoiceLineItems(
  form: FormData,
  ids: string[],
  reverseCharge: boolean,
): Array<Record<string, unknown>> {
  return ids.map((id, index) => {
    const lineNumber = index + 1;
    const quantity = requiredNumber(
      form,
      `line_${id}_quantity`,
      `Factuurlijn ${lineNumber} heeft een geldig aantal nodig.`,
    );
    const priceEuros = requiredNumber(
      form,
      `line_${id}_unit_price_euros`,
      `Factuurlijn ${lineNumber} heeft een expliciete prijs nodig.`,
    );
    const unit = requiredText(
      form,
      `line_${id}_unit`,
      `Factuurlijn ${lineNumber} heeft een eenheid nodig.`,
    );
    const requestedRate = requiredNumber(
      form,
      `line_${id}_vat_rate`,
      `Factuurlijn ${lineNumber} heeft een expliciet btw-tarief nodig.`,
    );

    if (quantity <= 0) throw new Error(`Factuurlijn ${lineNumber} heeft een geldig aantal nodig.`);
    if (priceEuros < 0) throw new Error(`Factuurlijn ${lineNumber} heeft een geldige prijs nodig.`);
    if (requestedRate !== 0.06 && requestedRate !== 0.21) {
      throw new Error(`Factuurlijn ${lineNumber} heeft een expliciet btw-tarief nodig.`);
    }

    const price = Math.round(priceEuros * 100);
    const unitCode = normalizeUnitCode(unit, nullableText(form, `line_${id}_unit_code`));
    if (!unitCode) throw new Error(`De eenheid van lijn ${lineNumber} kan niet naar een Peppol-code worden vertaald.`);

    const vatRate: InvoiceVatRate = reverseCharge ? 0 : requestedRate;
    const vatCategory: InvoiceVatCategory = reverseCharge ? 'AE' : 'S';
    return {
      id,
      description: requiredText(
        form,
        `line_${id}_description`,
        `Factuurlijn ${lineNumber} heeft een omschrijving nodig.`,
      ),
      quantity,
      unit,
      unit_code: unitCode,
      unit_price_cents: price,
      vat_rate: vatRate,
      vat_category: vatCategory,
      line_total_cents: invoiceLineTotalCents(quantity, price),
      sort_order: index,
      source_quote_id: nullableText(form, `line_${id}_source_quote_id`),
      source_quote_line_item_id: nullableText(form, `line_${id}_source_quote_line_item_id`),
    };
  });
}
