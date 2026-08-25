import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildCanonicalInvoice } from '../src/lib/invoices/model';
import { buildPeppolUbl } from '../src/lib/invoices/ubl';
import type { Invoice, InvoiceLineItem } from '../src/lib/supabase/types';

const output = resolve(process.argv[2] ?? '.cache/peppol/fixtures');
await mkdir(output, { recursive: true });

const seller = {
  name: 'Voorbeeld Bouw BV', street: 'Wetstraat 1', postalCode: '1000', city: 'Brussel', countryCode: 'BE',
  vatNumber: 'BE0563846944', enterpriseNumber: '0563846944', registrationNumber: '0563846944',
  email: 'facturen@example.test', phone: '+3212345678', legalForm: 'BV', iban: 'BE68539007547034', peppolId: '0208:0563846944',
};
const buyer = { ...seller, name: 'Voorbeeld Klant BV', street: 'Kerkstraat 2', postalCode: '9000', city: 'Gent' };

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: '11111111-1111-4111-8111-111111111111', contractor_id: '22222222-2222-4222-8222-222222222222', quote_id: '33333333-3333-4333-8333-333333333333',
    document_type: 'invoice', original_invoice_id: null, original_invoice_number: null, status: 'issued', customer_type: 'business',
    customer_name: buyer.name, customer_address: `${buyer.street}, ${buyer.postalCode} ${buyer.city}`, customer_street: buyer.street,
    customer_postal_code: buyer.postalCode, customer_city: buyer.city, customer_country_code: 'BE', customer_email: buyer.email,
    customer_phone: buyer.phone, customer_vat_number: buyer.vatNumber, customer_enterprise_number: buyer.enterpriseNumber,
    customer_peppol_id: buyer.peppolId, seller_snapshot: seller, buyer_snapshot: buyer, invoice_number: 'STQ-2026-0001',
    issue_date: '2026-08-18', delivery_date: '2026-08-17', due_date: '2026-09-17', currency: 'EUR', buyer_reference: 'PO-2026-001',
    vat_treatment: 'standard', reverse_charge_confirmed: false, reduced_vat_confirmed: false, reduced_vat_declaration: null,
    reduced_vat_declaration_version: null, subtotal_cents: 0, vat_total_cents: 0, total_cents: 0, delivery_channel: 'peppol_manual',
    delivery_status: 'ready_for_upload', transport_status: 'ready', business_response_status: null, delivery_status_source: 'system',
    delivery_submitted_at: null, delivery_external_reference: null, delivery_receipt_path: null, delivery_receipt_sha256: null,
    paid_at: null, pdf_path: null, ubl_path: null, pdf_sha256: null, ubl_sha256: null, document_status: 'ready', document_error: null,
    peppol_validation_release: '3.0.21', retain_until: '2037-01-01', issued_at: '2026-08-18T10:00:00Z',
    created_at: '2026-08-18T10:00:00Z', updated_at: '2026-08-18T10:00:00Z', ...overrides,
  };
}

function line(id: string, cents: number, rate: 0 | 0.06 | 0.21, category: 'S' | 'AE' = 'S'): InvoiceLineItem {
  return { id, invoice_id: '11111111-1111-4111-8111-111111111111', source_quote_id: null, source_quote_line_item_id: null, description: `Voorbeeldwerk ${id}`, quantity: 1, unit: 'stuk', unit_code: 'C62', unit_price_cents: cents, vat_rate: rate, vat_category: category, line_total_cents: cents, sort_order: Number(id), created_at: '2026-08-18T10:00:00Z' };
}

const cases: Array<{ name: string; invoice: Invoice; lines: InvoiceLineItem[] }> = [
  { name: 'standard-6', invoice: invoice({ invoice_number: 'STQ-2026-0001', subtotal_cents: 10000, vat_total_cents: 600, total_cents: 10600 }), lines: [line('1', 10000, 0.06)] },
  { name: 'standard-21', invoice: invoice({ invoice_number: 'STQ-2026-0002', subtotal_cents: 10000, vat_total_cents: 2100, total_cents: 12100 }), lines: [line('1', 10000, 0.21)] },
  { name: 'mixed', invoice: invoice({ invoice_number: 'STQ-2026-0003', subtotal_cents: 20000, vat_total_cents: 2700, total_cents: 22700 }), lines: [line('1', 10000, 0.06), line('2', 10000, 0.21)] },
  { name: 'reverse-charge', invoice: invoice({ invoice_number: 'STQ-2026-0004', vat_treatment: 'reverse_charge', reverse_charge_confirmed: true, subtotal_cents: 10000, vat_total_cents: 0, total_cents: 10000 }), lines: [line('1', 10000, 0, 'AE')] },
  { name: 'credit-note', invoice: invoice({ id: '44444444-4444-4444-8444-444444444444', document_type: 'credit_note', original_invoice_id: '11111111-1111-4111-8111-111111111111', original_invoice_number: 'STQ-2026-0002', invoice_number: 'STQ-CN-2026-0001', due_date: null, subtotal_cents: 10000, vat_total_cents: 2100, total_cents: 12100 }), lines: [line('1', 10000, 0.21)] },
];

for (const fixture of cases) {
  await writeFile(resolve(output, `${fixture.name}.xml`), buildPeppolUbl(buildCanonicalInvoice(fixture.invoice, fixture.lines)), 'utf8');
}
