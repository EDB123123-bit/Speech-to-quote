import { describe, expect, it } from 'vitest';
import { buildPeppolUbl } from '@/lib/invoices/ubl';
import type { Invoice, InvoiceLineItem } from '@/lib/supabase/types';
import { buildCanonicalInvoice } from '@/lib/invoices/model';
import { buildInvoiceViewModel } from '@/lib/pdf/invoice-view-model';
import { JSDOM } from 'jsdom';

const invoice = {
  id: 'invoice-1', contractor_id: 'contractor-1', quote_id: 'quote-1', document_type: 'invoice', original_invoice_id: null, original_invoice_number: null,
  status: 'issued', customer_type: 'business', customer_name: 'Klant BV', customer_address: 'Kerkstraat 1, 9000 Gent', customer_street: 'Kerkstraat 1', customer_postal_code: '9000', customer_city: 'Gent', customer_country_code: 'BE', customer_email: null, customer_phone: null, customer_vat_number: 'BE0563846944', customer_enterprise_number: '0563846944', customer_peppol_id: '0208:0563846944', seller_snapshot: {}, buyer_snapshot: {}, invoice_number: 'STQ-2026-0001', issue_date: '2026-08-17', delivery_date: '2026-08-16', due_date: '2026-09-16', currency: 'EUR', buyer_reference: 'PO-2026-42', vat_treatment: 'standard', reverse_charge_confirmed: false, reduced_vat_confirmed: false, reduced_vat_declaration: null, subtotal_cents: 10000, vat_total_cents: 2100, total_cents: 12100, delivery_channel: 'peppol_manual', delivery_status: 'ready_for_upload', delivery_submitted_at: null, delivery_external_reference: null, delivery_receipt_path: null, paid_at: null, pdf_path: null, ubl_path: null, pdf_sha256: null, ubl_sha256: null, issued_at: '2026-08-17T12:00:00Z', created_at: '2026-08-17T12:00:00Z', updated_at: '2026-08-17T12:00:00Z',
} as Invoice;
const lines = [{ id: 'line-1', invoice_id: invoice.id, description: 'Dakwerken & goten', quantity: 1, unit: 'stuk', unit_code: 'C62', unit_price_cents: 10000, vat_rate: 0.21, vat_category: 'S', line_total_cents: 10000, sort_order: 0, created_at: invoice.created_at }] as InvoiceLineItem[];

describe('buildPeppolUbl', () => {
  it('emits Peppol identifiers, totals, units, and escaped descriptions', () => {
    const model = buildCanonicalInvoice(invoice, lines);
    const xml = buildPeppolUbl(model);
    const pdf = buildInvoiceViewModel(model);
    expect(xml).toContain('<cbc:ID>STQ-2026-0001</cbc:ID>');
    expect(xml).toContain('schemeID="0208"');
    expect(xml).toContain('unitCode="C62"');
    expect(xml).toContain('Dakwerken &amp; goten');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">121.00</cbc:PayableAmount>');
    expect(xml).toContain('<cbc:ActualDeliveryDate>2026-08-16</cbc:ActualDeliveryDate>');
    expect(xml).toContain('<cbc:BuyerReference>PO-2026-42</cbc:BuyerReference>');
    const parsed = new JSDOM(xml, { contentType: 'application/xml' }).window.document;
    expect(parsed.getElementsByTagNameNS('*', 'ActualDeliveryDate')[0]?.textContent).toBe(pdf.deliveryDate);
    expect(parsed.getElementsByTagNameNS('*', 'BuyerReference')[0]?.textContent).toBe(pdf.buyerReference);
    expect(parsed.getElementsByTagNameNS('*', 'PayableAmount')[0]?.textContent).toBe('121.00');
    expect(pdf.total).toBe('€ 121,00');
  });

  it('uses a CreditNote document and references the original invoice number', () => {
    const credit = { ...invoice, document_type: 'credit_note', original_invoice_id: 'invoice-1', original_invoice_number: 'STQ-2026-0001', invoice_number: 'STQ-CN-2026-0001' } as Invoice;
    const xml = buildPeppolUbl(buildCanonicalInvoice(credit, lines));
    expect(xml).toContain('<CreditNote ');
    expect(xml).toContain('<cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>');
    expect(xml).toContain('<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>STQ-2026-0001</cbc:ID>');
    expect(xml).toContain('<cac:CreditNoteLine>');
    expect(xml).toContain('<cbc:PayableAmount currencyID="EUR">121.00</cbc:PayableAmount>');
    expect(xml).not.toContain('<cbc:DueDate>');
    expect(xml).not.toContain('<cac:PaymentMeans>');
  });

  it('emits the mandatory reverse-charge exemption code and wording', () => {
    const reverse = { ...invoice, vat_treatment: 'reverse_charge', reverse_charge_confirmed: true, vat_total_cents: 0, total_cents: 10000 } as Invoice;
    const reverseLines = [{ ...lines[0], vat_rate: 0, vat_category: 'AE' }] as InvoiceLineItem[];
    const xml = buildPeppolUbl(buildCanonicalInvoice(reverse, reverseLines));
    expect(xml).toContain('<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode>');
    expect(xml).toContain('<cbc:TaxExemptionReason>Verlegging van heffing</cbc:TaxExemptionReason>');
  });

  it('refuses a synthetic B2B fallback reference', () => {
    expect(() => buildPeppolUbl(buildCanonicalInvoice({ ...invoice, buyer_reference: '' }, lines))).toThrow('kopersreferentie');
  });
});
