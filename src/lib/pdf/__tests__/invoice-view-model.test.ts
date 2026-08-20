import { describe, expect, it } from 'vitest';
import { buildInvoiceViewModel } from '../invoice-view-model';
import { buildCanonicalInvoice } from '@/lib/invoices/model';
import type { Invoice, InvoiceLineItem } from '@/lib/supabase/types';

describe('invoice PDF view model', () => {
  it('shows positive credit-note values without a payment request', () => {
    const invoice = {
      document_type: 'credit_note', invoice_number: 'STQ-CN-2026-0001', issue_date: '2026-08-18', delivery_date: '2026-08-16', due_date: null,
      buyer_reference: 'PO-42', vat_treatment: 'standard', reduced_vat_confirmed: false, reduced_vat_declaration: null,
      seller_snapshot: { iban: 'BE68539007547034' }, buyer_snapshot: {}, customer_name: 'Klant', customer_address: '', customer_country_code: 'BE',
    } as unknown as Invoice;
    const lines = [{ description: 'Werken', quantity: 1, unit: 'stuk', unit_code: 'C62', unit_price_cents: 10000, line_total_cents: 10000, vat_rate: 0.21, vat_category: 'S' }] as InvoiceLineItem[];
    const view = buildInvoiceViewModel(buildCanonicalInvoice(invoice, lines));
    expect(view.total).toBe('€ 121,00');
    expect(view.deliveryDate).toBe('2026-08-16');
    expect(view.dueDate).toBeNull();
    expect(view.paymentIban).toBeNull();
  });
});
