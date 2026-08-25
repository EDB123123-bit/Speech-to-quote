import type { Contractor, Invoice, InvoiceLineItem } from '@/lib/supabase/types';
import { calculateInvoiceTotals } from './totals';

export type InvoicePartySnapshot = {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  countryCode: string;
  vatNumber: string;
  enterpriseNumber: string;
  email: string;
  phone: string;
  legalForm: string;
  registrationNumber: string;
  iban: string;
  peppolId: string;
};

export type CanonicalInvoice = {
  invoice: Invoice;
  lines: InvoiceLineItem[];
  seller: InvoicePartySnapshot;
  buyer: InvoicePartySnapshot;
  totals: ReturnType<typeof calculateInvoiceTotals>;
  isCreditNote: boolean;
};

function party(value: Record<string, unknown>, fallback: Partial<InvoicePartySnapshot>): InvoicePartySnapshot {
  return {
    name: String(value.name ?? fallback.name ?? ''),
    street: String(value.street ?? fallback.street ?? ''),
    postalCode: String(value.postalCode ?? fallback.postalCode ?? ''),
    city: String(value.city ?? fallback.city ?? ''),
    countryCode: String(value.countryCode ?? fallback.countryCode ?? 'BE'),
    vatNumber: String(value.vatNumber ?? fallback.vatNumber ?? ''),
    enterpriseNumber: String(value.enterpriseNumber ?? fallback.enterpriseNumber ?? ''),
    email: String(value.email ?? fallback.email ?? ''),
    phone: String(value.phone ?? fallback.phone ?? ''),
    legalForm: String(value.legalForm ?? fallback.legalForm ?? ''),
    registrationNumber: String(value.registrationNumber ?? fallback.registrationNumber ?? ''),
    iban: String(value.iban ?? fallback.iban ?? ''),
    peppolId: String(value.peppolId ?? fallback.peppolId ?? ''),
  };
}

export function buildCanonicalInvoice(invoice: Invoice, lines: InvoiceLineItem[], contractor?: Contractor): CanonicalInvoice {
  const totals = calculateInvoiceTotals(lines);
  if (invoice.status === 'issued' || invoice.status === 'credited') {
    if (totals.subtotalCents !== invoice.subtotal_cents || totals.vatTotalCents !== invoice.vat_total_cents || totals.totalCents !== invoice.total_cents) {
      throw new Error('De opgeslagen factuurtotalen komen niet overeen met de onveranderlijke factuurlijnen.');
    }
  }
  const sellerFallback = contractor ? {
    name: contractor.company_name,
    street: contractor.street ?? contractor.address ?? '',
    postalCode: contractor.postal_code ?? '',
    city: contractor.city ?? '',
    countryCode: contractor.country_code,
    vatNumber: contractor.vat_number ?? '',
    enterpriseNumber: contractor.registration_number ?? '',
    email: contractor.email ?? '',
    phone: contractor.phone ?? '',
    legalForm: contractor.legal_form ?? '',
    registrationNumber: contractor.registration_number ?? '',
    iban: contractor.iban ?? '',
    peppolId: '',
  } : {};
  const buyerFallback = {
    name: invoice.customer_name,
    street: invoice.customer_street ?? invoice.customer_address,
    postalCode: invoice.customer_postal_code ?? '',
    city: invoice.customer_city ?? '',
    countryCode: invoice.customer_country_code,
    vatNumber: invoice.customer_vat_number ?? '',
    enterpriseNumber: invoice.customer_enterprise_number ?? '',
    email: invoice.customer_email ?? '',
    phone: invoice.customer_phone ?? '',
    legalForm: '', registrationNumber: '', iban: '', peppolId: invoice.customer_peppol_id ?? '',
  };
  return {
    invoice,
    lines,
    seller: party(invoice.seller_snapshot, sellerFallback),
    buyer: party(invoice.buyer_snapshot, buyerFallback),
    totals,
    isCreditNote: invoice.document_type === 'credit_note',
  };
}
