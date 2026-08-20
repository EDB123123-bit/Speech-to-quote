'use server';

import { createHash } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireContractor } from '@/lib/auth/require-contractor';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { buildCanonicalInvoice } from '@/lib/invoices/model';
import { normalizeBelgianVat, normalizeEnterpriseNumber, normalizeUnitCode, parseAddress, peppolParticipantId, REDUCED_VAT_DECLARATION_NL, REDUCED_VAT_DECLARATION_VERSION } from '@/lib/invoices/constants';
import { invoiceLineTotalCents } from '@/lib/invoices/totals';
import { assertBelgianSellerIdentifiers } from '@/lib/invoices/validation';
import { buildPeppolUbl } from '@/lib/invoices/ubl';
import { renderInvoicePdf } from '@/lib/pdf/invoice-render';
import type { Contractor, Invoice, InvoiceLineItem, InvoiceVatCategory, InvoiceVatRate } from '@/lib/supabase/types';

function text(form: FormData, key: string, fallback = ''): string {
  return String(form.get(key) ?? fallback).trim();
}

function nullable(form: FormData, key: string): string | null {
  const value = text(form, key);
  return value || null;
}

function bool(form: FormData, key: string): boolean {
  return form.get(key) === 'on' || form.get(key) === 'true';
}

function isoDate(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? value : null;
}

function sellerSnapshot(contractor: Contractor) {
  return {
    name: contractor.company_name,
    street: contractor.street ?? contractor.address ?? '',
    postalCode: contractor.postal_code ?? '',
    city: contractor.city ?? '',
    countryCode: contractor.country_code || 'BE',
    vatNumber: normalizeBelgianVat(contractor.vat_number) ?? '',
    enterpriseNumber: normalizeEnterpriseNumber(contractor.registration_number) ?? '',
    email: contractor.email ?? '',
    phone: contractor.phone ?? '',
    legalForm: contractor.legal_form ?? '',
    rpr: contractor.rpr ?? '',
    registrationNumber: contractor.registration_number ?? '',
    iban: contractor.iban ?? '',
    peppolId: peppolParticipantId(contractor.registration_number) ?? '',
  };
}

function buyerSnapshot(form: FormData) {
  return {
    name: text(form, 'customer_name'),
    street: text(form, 'customer_street'),
    postalCode: text(form, 'customer_postal_code'),
    city: text(form, 'customer_city'),
    countryCode: text(form, 'customer_country_code', 'BE'),
    vatNumber: normalizeBelgianVat(nullable(form, 'customer_vat_number')) ?? '',
    enterpriseNumber: normalizeEnterpriseNumber(nullable(form, 'customer_enterprise_number')) ?? '',
    email: text(form, 'customer_email'),
    phone: text(form, 'customer_phone'),
    legalForm: '', rpr: '', registrationNumber: '', iban: '',
    peppolId: nullable(form, 'customer_peppol_id') ?? '',
  };
}

function parseLineItems(form: FormData, ids: string[], reverseCharge: boolean): Array<Record<string, unknown>> {
  return ids.map((id, index) => {
    const quantity = Number(text(form, `line_${id}_quantity`, '1'));
    const price = Math.round(Number(text(form, `line_${id}_unit_price_euros`, '0')) * 100);
    const unit = text(form, `line_${id}_unit`, 'stuk');
    const unitCode = normalizeUnitCode(unit, nullable(form, `line_${id}_unit_code`));
    const requestedRate = Number(text(form, `line_${id}_vat_rate`, '0.21')) as InvoiceVatRate;
    const vatRate: InvoiceVatRate = reverseCharge ? 0 : (requestedRate === 0.06 ? 0.06 : 0.21);
    const vatCategory: InvoiceVatCategory = reverseCharge ? 'AE' : 'S';
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Elke factuurlijn heeft een geldig aantal nodig.');
    if (!Number.isFinite(price) || price < 0) throw new Error('Elke factuurlijn heeft een geldige prijs nodig.');
    if (!unitCode) throw new Error(`De eenheid van lijn ${index + 1} kan niet naar een Peppol-code worden vertaald.`);
    return {
      id,
      description: text(form, `line_${id}_description`), quantity, unit, unit_code: unitCode,
      unit_price_cents: price, vat_rate: vatRate, vat_category: vatCategory,
      line_total_cents: invoiceLineTotalCents(quantity, price), sort_order: index,
    };
  });
}

function validateProfile(contractor: Contractor) {
  const missing = [
    ['bedrijfsnaam', contractor.company_name],
    ['straat', contractor.street ?? contractor.address],
    ['postcode', contractor.postal_code],
    ['gemeente', contractor.city],
    ['BTW-nummer', contractor.vat_number],
    ['KBO-nummer', contractor.registration_number],
    ['IBAN', contractor.iban],
    ['rechtsvorm', contractor.legal_form],
    ['RPR', contractor.rpr],
    ['facturatie-e-mail', contractor.email],
  ].filter(([, value]) => !value || !String(value).trim()).map(([label]) => label);
  if (missing.length) throw new Error(`Vul eerst je facturatieprofiel aan: ${missing.join(', ')}.`);
  assertBelgianSellerIdentifiers({
    enterpriseNumber: contractor.registration_number,
    vatNumber: contractor.vat_number,
    iban: contractor.iban,
  });
}

export type InvoiceActionState = {
  message: string;
};

function invoiceErrorMessage(message: string | undefined, fallback: string): string {
  const messages: Record<string, string> = {
    seller_profile_invalid: 'Controleer het KBO-/btw-nummer en IBAN in je facturatieprofiel.',
    buyer_address_invalid: 'Vul het volledige Belgische klantadres in.',
    business_identifiers_invalid: 'Het KBO- en btw-nummer van de zakelijke klant zijn ongeldig of komen niet overeen.',
    invalid_peppol_id: 'De Peppol-ID moet automatisch overeenkomen met 0208 gevolgd door het KBO-nummer.',
    buyer_reference_required: 'Vul voor een zakelijke klant een echte kopersreferentie in.',
    reduced_vat_b2b_unsupported: '6% renovatie-btw wordt in deze release alleen voor particuliere klanten ondersteund.',
    reduced_vat_confirmation_required: 'Bevestig de actuele 6%-renovatieverklaring voordat je de factuur uitgeeft.',
    invalid_reverse_charge: 'Controleer de zakelijke klant en bevestiging voor binnenlandse verlegging van heffing.',
    delivery_date_required: 'Vul een prestatiedatum in.',
    due_date_required: 'Vul een vervaldatum in.',
    due_date_before_issue_date: 'De vervaldatum kan niet vóór de factuurdatum liggen.',
    invalid_invoice_line: 'Controleer de omschrijving, hoeveelheid, prijs, btw en Peppol-eenheid van elke lijn.',
  };
  const key = Object.keys(messages).find((candidate) => message?.includes(candidate));
  return key ? messages[key] : (message || fallback);
}

async function loadInvoice(invoiceId: string) {
  const { supabase, contractor } = await requireContractor();
  const [{ data: invoice }, { data: lines }] = await Promise.all([
    supabase.from('invoices').select('*').eq('id', invoiceId).single(),
    supabase.from('invoice_line_items').select('*').eq('invoice_id', invoiceId).order('sort_order'),
  ]);
  if (!invoice) throw new Error('Factuur niet gevonden.');
  return { supabase, contractor, invoice: invoice as Invoice, lines: (lines ?? []) as InvoiceLineItem[] };
}

export async function createInvoiceDraft(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const quoteId = text(form, 'quote_id');
  const [{ data: quote }, { data: sourceLines }] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', quoteId).eq('status', 'final').single(),
    supabase.from('quote_line_items').select('*').eq('quote_id', quoteId).order('sort_order'),
  ]);
  if (!quote) throw new Error('Alleen afgewerkte offertes kunnen worden gefactureerd.');
  const { data: existing } = await supabase.from('invoices').select('id').eq('quote_id', quoteId).eq('document_type', 'invoice').maybeSingle();
  if (existing) redirect(`/facturen/${existing.id}`);

  const parsedAddress = parseAddress(String(quote.customer_address ?? ''));
  const customerType = text(form, 'customer_type', 'private') === 'business' ? 'business' : 'private';
  const reverseCharge = bool(form, 'reverse_charge');
  const lines = (sourceLines ?? []).map((line, index) => {
    const unitCode = normalizeUnitCode(String(line.unit), line.unit_code);
    if (!unitCode) throw new Error(`Eenheid “${line.unit}” ontbreekt. Kies een geldige eenheid in de factuur.`);
    return {
      description: String(line.description), quantity: Number(line.quantity), unit: String(line.unit), unit_code: unitCode,
      unit_price_cents: Number(line.unit_price_cents ?? 0), vat_rate: reverseCharge ? 0 : Number(line.vat_rate ?? 0.21),
      vat_category: reverseCharge ? 'AE' : 'S', line_total_cents: invoiceLineTotalCents(Number(line.quantity), Number(line.unit_price_cents ?? 0)), sort_order: index,
    };
  });
  const customerVat = normalizeBelgianVat(nullable(form, 'customer_vat_number'));
  const enterprise = normalizeEnterpriseNumber(nullable(form, 'customer_enterprise_number'));
  const peppolId = customerType === 'business' ? peppolParticipantId(enterprise) : null;
  const draft = {
    customer_type: customerType,
    customer_name: text(form, 'customer_name', quote.customer_name ?? ''), customer_address: text(form, 'customer_address', quote.customer_address ?? ''),
    customer_street: text(form, 'customer_street', parsedAddress.street), customer_postal_code: text(form, 'customer_postal_code', parsedAddress.postalCode), customer_city: text(form, 'customer_city', parsedAddress.city), customer_country_code: text(form, 'customer_country_code', 'BE'),
    customer_email: text(form, 'customer_email', quote.customer_email ?? '') || null, customer_phone: text(form, 'customer_phone', quote.customer_phone ?? '') || null,
    customer_vat_number: customerVat, customer_enterprise_number: enterprise, customer_peppol_id: peppolId,
    seller_snapshot: sellerSnapshot(contractor), buyer_snapshot: { ...buyerSnapshot(form), name: text(form, 'customer_name', quote.customer_name ?? ''), street: text(form, 'customer_street', parsedAddress.street), postalCode: text(form, 'customer_postal_code', parsedAddress.postalCode), city: text(form, 'customer_city', parsedAddress.city), vatNumber: customerVat ?? '', enterpriseNumber: enterprise ?? '', peppolId: peppolId ?? '' },
    issue_date: isoDate(text(form, 'issue_date')) ?? new Date().toISOString().slice(0, 10), delivery_date: isoDate(text(form, 'delivery_date')) ?? new Date().toISOString().slice(0, 10), due_date: isoDate(text(form, 'due_date')) ?? new Date(Date.now() + (contractor.default_payment_term_days ?? 30) * 86400000).toISOString().slice(0, 10),
    buyer_reference: text(form, 'buyer_reference'), vat_treatment: reverseCharge ? 'reverse_charge' : 'standard', reverse_charge_confirmed: reverseCharge,
    reduced_vat_confirmed: bool(form, 'reduced_vat_confirmed'), reduced_vat_declaration: bool(form, 'reduced_vat_confirmed') ? REDUCED_VAT_DECLARATION_NL : null,
    reduced_vat_declaration_version: bool(form, 'reduced_vat_confirmed') ? REDUCED_VAT_DECLARATION_VERSION : null,
    delivery_channel: customerType === 'business' ? 'peppol_manual' : 'email',
    lines,
  };
  const { data: invoice, error } = await supabase.rpc('create_invoice_draft_from_quote', { p_quote_id: quoteId, p_draft: draft });
  if (error || !invoice) throw new Error('Factuur aanmaken mislukt. Probeer opnieuw.');
  redirect(`/facturen/${invoice.id}`);
}

export async function updateInvoiceDraft(form: FormData): Promise<void> {
  const invoiceId = text(form, 'invoice_id');
  const { supabase, contractor, invoice, lines: oldLines } = await loadInvoice(invoiceId);
  if (invoice.status !== 'draft') throw new Error('Een uitgegeven factuur kan niet meer gewijzigd worden.');
  const customerType = text(form, 'customer_type', invoice.customer_type) === 'business' ? 'business' : 'private';
  const reverseCharge = bool(form, 'reverse_charge');
  const lines = parseLineItems(form, oldLines.map((line) => line.id), reverseCharge);
  const enterprise = normalizeEnterpriseNumber(nullable(form, 'customer_enterprise_number'));
  const customerVat = normalizeBelgianVat(nullable(form, 'customer_vat_number'));
  const peppolId = customerType === 'business' ? peppolParticipantId(enterprise) : null;
  const updated = {
    customer_type: customerType, customer_name: text(form, 'customer_name'), customer_address: text(form, 'customer_address'), customer_street: text(form, 'customer_street'), customer_postal_code: text(form, 'customer_postal_code'), customer_city: text(form, 'customer_city'), customer_country_code: text(form, 'customer_country_code', 'BE'), customer_email: nullable(form, 'customer_email'), customer_phone: nullable(form, 'customer_phone'), customer_vat_number: customerVat, customer_enterprise_number: enterprise, customer_peppol_id: peppolId,
    buyer_reference: text(form, 'buyer_reference'), issue_date: isoDate(text(form, 'issue_date')), delivery_date: isoDate(text(form, 'delivery_date')), due_date: isoDate(text(form, 'due_date')), vat_treatment: reverseCharge ? 'reverse_charge' : 'standard', reverse_charge_confirmed: reverseCharge, reduced_vat_confirmed: bool(form, 'reduced_vat_confirmed'), reduced_vat_declaration: bool(form, 'reduced_vat_confirmed') ? REDUCED_VAT_DECLARATION_NL : null, reduced_vat_declaration_version: bool(form, 'reduced_vat_confirmed') ? REDUCED_VAT_DECLARATION_VERSION : null, delivery_channel: customerType === 'business' ? 'peppol_manual' : 'email', seller_snapshot: sellerSnapshot(contractor), buyer_snapshot: { ...buyerSnapshot(form), peppolId: peppolId ?? '' }, lines,
  };
  const { error } = await supabase.rpc('save_invoice_draft', { p_invoice_id: invoiceId, p_draft: updated });
  if (error) throw new Error('Factuur opslaan mislukt.');
  revalidatePath(`/facturen/${invoiceId}`); revalidatePath('/facturen');
}

async function uploadImmutable(path: string, bytes: Buffer, contentType: string, expectedHash: string) {
  const bucket = createAdminSupabase().storage.from('invoice-documents');
  const uploaded = await bucket.upload(path, bytes, { contentType, upsert: false });
  if (!uploaded.error) return;
  if (!uploaded.error.message.toLowerCase().includes('already exists')) throw uploaded.error;
  const existing = await bucket.download(path);
  if (existing.error || !existing.data) throw existing.error ?? new Error('Bestaand document kon niet worden gecontroleerd.');
  const existingHash = createHash('sha256').update(Buffer.from(await existing.data.arrayBuffer())).digest('hex');
  if (existingHash !== expectedHash) throw new Error('Een bestaand factuurdocument heeft een afwijkende hash.');
}

async function persistDocuments(args: { supabase: Awaited<ReturnType<typeof requireContractor>>['supabase']; contractor: Contractor; invoice: Invoice; lines: InvoiceLineItem[] }) {
  const model = buildCanonicalInvoice(args.invoice, args.lines, args.contractor);
  try {
    const pdf = await renderInvoicePdf(model);
    const ubl = args.invoice.customer_type === 'business' ? buildPeppolUbl(model) : null;
    const stem = `${args.contractor.id}/${args.invoice.id}/${args.invoice.invoice_number}`;
    const pdfPath = `${stem}.pdf`;
    const ublPath = ubl ? `${stem}.xml` : null;
    const pdfHash = createHash('sha256').update(pdf).digest('hex');
    const ublHash = ubl ? createHash('sha256').update(ubl).digest('hex') : null;
    await uploadImmutable(pdfPath, pdf, 'application/pdf', pdfHash);
    if (ubl && ublPath && ublHash) await uploadImmutable(ublPath, Buffer.from(ubl), 'application/xml', ublHash);
    const { error } = await args.supabase.rpc('record_invoice_documents', {
      p_invoice_id: args.invoice.id, p_pdf_path: pdfPath, p_pdf_sha256: pdfHash,
      p_ubl_path: ublPath, p_ubl_sha256: ublHash, p_error: null,
    });
    if (error) throw error;
  } catch (error) {
    await args.supabase.rpc('record_invoice_documents', {
      p_invoice_id: args.invoice.id, p_pdf_path: null, p_pdf_sha256: null,
      p_ubl_path: null, p_ubl_sha256: null,
      p_error: error instanceof Error ? error.message : 'Onbekende documentfout',
    });
    throw error;
  }
}

export async function issueInvoiceAction(form: FormData): Promise<void> {
  const invoiceId = text(form, 'invoice_id');
  const { supabase, contractor } = await requireContractor();
  validateProfile(contractor);
  const { data, error } = await supabase.rpc('issue_invoice', { p_invoice_id: invoiceId });
  if (error || !data) throw new Error(invoiceErrorMessage(error?.message, 'Factuur uitgeven mislukt.'));
  const { invoice, lines } = await loadInvoice(invoiceId);
  await persistDocuments({ supabase, contractor, invoice, lines });
  revalidatePath(`/facturen/${invoiceId}`); revalidatePath('/facturen');
}

export async function retryInvoiceDocumentsAction(form: FormData): Promise<void> {
  const invoiceId = text(form, 'invoice_id');
  const { supabase, contractor, invoice, lines } = await loadInvoice(invoiceId);
  if (invoice.status === 'draft') throw new Error('Geef de factuur eerst uit.');
  await persistDocuments({ supabase, contractor, invoice, lines });
  revalidatePath(`/facturen/${invoiceId}`);
  revalidatePath('/facturen');
}

/**
 * Form-facing wrapper for expected issuance failures. The mutation above is
 * also used directly by server forms, so it keeps its throwing contract; this
 * wrapper lets the draft page render validation feedback instead of surfacing
 * a server-action runtime error.
 */
export async function issueInvoiceFormAction(
  _previousState: InvoiceActionState,
  form: FormData,
): Promise<InvoiceActionState> {
  try {
    await issueInvoiceAction(form);
    return { message: '' };
  } catch (error) {
    return {
      message: error instanceof Error && error.message
        ? error.message
        : 'Factuur uitgeven mislukt. Probeer opnieuw.',
    };
  }
}

export async function updateDeliveryStatusAction(form: FormData): Promise<void> {
  const { supabase, contractor } = await requireContractor();
  const invoiceId = text(form, 'invoice_id');
  const status = text(form, 'delivery_status');
  if (!['submitted', 'accepted', 'rejected'].includes(status)) throw new Error('Ongeldige leveringsstatus.');
  const receipt = form.get('receipt');
  let receiptPath: string | null = null;
  let receiptHash: string | null = null;
  if (receipt instanceof File && receipt.size > 0) {
    if (receipt.size > 5_000_000) throw new Error('Het ontvangstbewijs mag maximaal 5 MB groot zijn.');
    const extension = (receipt.name.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
    const bytes = Buffer.from(await receipt.arrayBuffer());
    receiptHash = createHash('sha256').update(bytes).digest('hex');
    receiptPath = `${contractor.id}/${invoiceId}/delivery-receipt-${receiptHash}.${extension}`;
    await uploadImmutable(receiptPath, bytes, receipt.type || 'application/octet-stream', receiptHash);
  }
  const transportStatus = status === 'accepted' ? 'delivered' : status === 'rejected' ? 'failed' : 'submitted';
  const businessStatus = status === 'accepted' ? 'accepted' : status === 'rejected' ? 'rejected' : null;
  const { error } = await supabase.rpc('record_manual_delivery', { p_invoice_id: invoiceId, p_transport_status: transportStatus, p_business_response_status: businessStatus, p_external_reference: nullable(form, 'delivery_external_reference'), p_receipt_path: receiptPath, p_receipt_sha256: receiptHash });
  if (error) throw new Error('Leveringsstatus opslaan mislukt.');
  revalidatePath(`/facturen/${invoiceId}`); revalidatePath('/facturen');
}

export async function setPaymentStatusAction(form: FormData): Promise<void> {
  const { supabase } = await requireContractor();
  const invoiceId = text(form, 'invoice_id');
  const paid = text(form, 'paid') === 'true';
  const { error } = await supabase.rpc('set_invoice_paid', { p_invoice_id: invoiceId, p_paid: paid });
  if (error) throw new Error('Betaalstatus opslaan mislukt.');
  revalidatePath(`/facturen/${invoiceId}`); revalidatePath('/facturen');
}

export async function createFullCreditNote(form: FormData): Promise<void> {
  const originalId = text(form, 'invoice_id');
  const { supabase, contractor, invoice: original } = await loadInvoice(originalId);
  if (original.status !== 'issued' || original.document_type !== 'invoice') throw new Error('Alleen een uitgegeven factuur kan volledig gecrediteerd worden.');
  const { data: credit, error } = await supabase.rpc('issue_full_credit_note', { p_original_invoice_id: originalId });
  if (error || !credit) throw new Error(invoiceErrorMessage(error?.message, 'Creditnota aanmaken mislukt.'));
  const loaded = await loadInvoice(credit.id);
  await persistDocuments({ supabase, contractor, invoice: loaded.invoice, lines: loaded.lines });
  revalidatePath(`/facturen/${originalId}`); revalidatePath(`/facturen/${credit.id}`); revalidatePath('/facturen');
}
