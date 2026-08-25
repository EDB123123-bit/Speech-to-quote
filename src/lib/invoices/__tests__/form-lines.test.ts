import { describe, expect, it } from 'vitest';
import { parseInvoiceLineItems } from '@/lib/invoices/form-lines';

function validForm(price = '12.50', vatRate = '0.21'): FormData {
  const form = new FormData();
  form.set('line_l1_description', 'Dakpannen');
  form.set('line_l1_quantity', '2');
  form.set('line_l1_unit', 'stuk');
  form.set('line_l1_unit_code', 'C62');
  form.set('line_l1_unit_price_euros', price);
  form.set('line_l1_vat_rate', vatRate);
  return form;
}

describe('parseInvoiceLineItems', () => {
  it('preserves an explicit zero price', () => {
    expect(parseInvoiceLineItems(validForm('0'), ['l1'], false)[0]).toMatchObject({
      unit_price_cents: 0,
      line_total_cents: 0,
      vat_rate: 0.21,
    });
  });

  it('rejects a missing price instead of silently defaulting to zero', () => {
    const form = validForm();
    form.delete('line_l1_unit_price_euros');
    expect(() => parseInvoiceLineItems(form, ['l1'], false)).toThrow(/expliciete prijs/u);
  });

  it('rejects a missing VAT rate instead of silently defaulting to 21%', () => {
    const form = validForm();
    form.delete('line_l1_vat_rate');
    expect(() => parseInvoiceLineItems(form, ['l1'], false)).toThrow(/expliciet btw-tarief/u);
  });

  it('uses reverse charge without accepting a malformed source VAT rate', () => {
    const lines = parseInvoiceLineItems(validForm('10', '0.06'), ['l1'], true);
    expect(lines[0]).toMatchObject({ vat_rate: 0, vat_category: 'AE' });
    expect(() => parseInvoiceLineItems(validForm('10', ''), ['l1'], true)).toThrow(/btw-tarief/u);
  });
});
