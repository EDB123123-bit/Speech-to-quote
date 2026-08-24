import { describe, expect, it } from 'vitest';
import { buildSupplierOrderViewModel } from '../supplier-order-view-model';
import type { Contractor, Quote, Supplier, SupplierOrder, SupplierOrderLine } from '@/lib/supabase/types';

const contractor = { id: 'c', company_name: 'Arzaak', address: 'Werfstraat 1', vat_number: 'BE0123', phone: null, onboarding_completed_at: null, created_at: '2026-01-01' } as Contractor;
const supplier = { id: 's', contractor_id: 'c', company_name: 'Cebeo', contact_person: 'Sam', email: 'sam@example.com', phone: null, address: 'Leverstraat 2', vat_number: 'BE0456', notes: null, created_at: '2026-01-01', updated_at: '2026-01-01' } satisfies Supplier;
const order = { id: 'o', contractor_id: 'c', quote_id: 'q', supplier_id: 's', order_number: 'BO-1', status: 'draft', delivery_address: 'Werf 3', notes: null, email_subject: null, email_body: null, pdf_path: null, pdf_sha256: null, pdf_version: 1, provider_message_id: null, sent_at: null, cancelled_at: null, created_at: '2026-01-01', updated_at: '2026-01-01' } satisfies SupplierOrder;
const quote = { id: 'q', contractor_id: 'c', quote_number: 'Q-1', quote_kind: 'standard', customer_name: 'Klant', customer_address: 'Werf 3' } as Quote;

describe('buildSupplierOrderViewModel', () => {
  it('keeps blank purchase prices null-like and preserves explicit zero', () => {
    const model = buildSupplierOrderViewModel({ contractor, supplier, order, quote, lines: [
      { id: 'l1', supplier_order_id: 'o', material_requirement_id: 'm1', description: 'Cement', quantity: 2, unit: 'st.', purchase_unit_price_cents: null, sort_order: 0, created_at: '', updated_at: '' },
      { id: 'l2', supplier_order_id: 'o', material_requirement_id: 'm2', description: 'Schroeven', quantity: 5, unit: 'doos', purchase_unit_price_cents: 0, sort_order: 1, created_at: '', updated_at: '' },
    ] as SupplierOrderLine[] });
    expect(model.lines[0]).toMatchObject({ purchaseUnitPrice: '—', lineTotal: '—' });
    expect(model.lines[1]).toMatchObject({ purchaseUnitPrice: '€ 0,00', lineTotal: '€ 0,00' });
    expect(JSON.stringify(model)).not.toContain('unit_price_cents');
    expect(JSON.stringify(model)).not.toContain('selling');
  });
});
