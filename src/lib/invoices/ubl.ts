import type { CanonicalInvoice } from './model';
import { REVERSE_CHARGE_NOTE_NL, REDUCED_VAT_DECLARATION_NL } from './constants';

const INVOICE_NS = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
const CREDIT_NOTE_NS = 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2';
const CAC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const CBC = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';

function xml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function amount(cents: number): string { return (cents / 100).toFixed(2); }
function date(value: string | null): string { return value ?? new Date().toISOString().slice(0, 10); }
function partyXml(party: CanonicalInvoice['seller'] | CanonicalInvoice['buyer'], isSeller: boolean): string {
  const endpoint = isSeller ? (party.enterpriseNumber ? `0208:${party.enterpriseNumber.replace(/\D/g, '')}` : '') : party.peppolId;
  return `<cac:Party>
    ${endpoint ? `<cbc:EndpointID schemeID="0208">${xml(endpoint.replace(/^0208:/, ''))}</cbc:EndpointID>` : ''}
    <cac:PartyName><cbc:Name>${xml(party.name)}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>${xml(party.street)}</cbc:StreetName><cbc:CityName>${xml(party.city)}</cbc:CityName><cbc:PostalZone>${xml(party.postalCode)}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>${xml(party.countryCode)}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    ${party.vatNumber ? `<cac:PartyTaxScheme><cbc:CompanyID>${xml(party.vatNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ''}
    <cac:PartyLegalEntity><cbc:RegistrationName>${xml(party.name)}</cbc:RegistrationName>${party.registrationNumber || party.enterpriseNumber ? `<cbc:CompanyID schemeID="0208">${xml((party.registrationNumber || party.enterpriseNumber).replace(/\D/g, ''))}</cbc:CompanyID>` : ''}</cac:PartyLegalEntity>
    ${party.email || party.phone ? `<cac:Contact>${party.phone ? `<cbc:Telephone>${xml(party.phone)}</cbc:Telephone>` : ''}${party.email ? `<cbc:ElectronicMail>${xml(party.email)}</cbc:ElectronicMail>` : ''}</cac:Contact>` : ''}
  </cac:Party>`;
}

export function buildPeppolUbl(model: CanonicalInvoice): string {
  const { invoice, seller, buyer, lines, totals } = model;
  if (invoice.customer_type === 'business' && !invoice.buyer_reference.trim()) {
    throw new Error('Een kopersreferentie is verplicht voor Peppol.');
  }
  if (!invoice.delivery_date) throw new Error('De prestatiedatum ontbreekt.');
  // UBL credit notes carry positive reversal amounts; the CreditNote root and
  // type code communicate the sign to the recipient.
  const sign = 1;
  const taxGroups = totals.groups.map((group) => `<cac:TaxSubtotal>
    <cbc:TaxableAmount currencyID="EUR">${amount(sign * group.subtotalCents)}</cbc:TaxableAmount>
    <cbc:TaxAmount currencyID="EUR">${amount(sign * group.vatAmountCents)}</cbc:TaxAmount>
    <cac:TaxCategory><cbc:ID>${group.vatCategory}</cbc:ID><cbc:Percent>${(group.vatRate * 100).toFixed(2)}</cbc:Percent>${group.vatCategory === 'AE' ? '<cbc:TaxExemptionReasonCode>VATEX-EU-AE</cbc:TaxExemptionReasonCode><cbc:TaxExemptionReason>Verlegging van heffing</cbc:TaxExemptionReason>' : ''}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
  </cac:TaxSubtotal>`).join('');
  const lineTag = model.isCreditNote ? 'CreditNoteLine' : 'InvoiceLine';
  const quantityTag = model.isCreditNote ? 'CreditedQuantity' : 'InvoicedQuantity';
  const lineXml = lines.map((line, index) => `<cac:${lineTag}>
    <cbc:ID>${index + 1}</cbc:ID><cbc:${quantityTag} unitCode="${xml(line.unit_code)}">${line.quantity}</cbc:${quantityTag}><cbc:LineExtensionAmount currencyID="EUR">${amount(sign * line.line_total_cents)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Description>${xml(line.description)}</cbc:Description><cbc:Name>${xml(line.description)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${line.vat_category}</cbc:ID><cbc:Percent>${(line.vat_rate * 100).toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="EUR">${amount(sign * line.unit_price_cents)}</cbc:PriceAmount><cbc:BaseQuantity unitCode="${xml(line.unit_code)}">1</cbc:BaseQuantity></cac:Price>
  </cac:${lineTag}>`).join('');
  const notes = [invoice.vat_treatment === 'reverse_charge' ? REVERSE_CHARGE_NOTE_NL : '', invoice.reduced_vat_declaration ?? (invoice.reduced_vat_confirmed ? REDUCED_VAT_DECLARATION_NL : '')].filter(Boolean).map((note) => `<cbc:Note>${xml(note)}</cbc:Note>`).join('');
  const type = model.isCreditNote ? '381' : '380';
  const original = model.isCreditNote && (invoice.original_invoice_number || invoice.original_invoice_id) ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${xml(invoice.original_invoice_number || invoice.original_invoice_id)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>` : '';
  const root = model.isCreditNote ? 'CreditNote' : 'Invoice';
  const ns = model.isCreditNote ? CREDIT_NOTE_NS : INVOICE_NS;
  const typeElement = model.isCreditNote ? 'CreditNoteTypeCode' : 'InvoiceTypeCode';
  return `<?xml version="1.0" encoding="UTF-8"?>
<${root} xmlns="${ns}" xmlns:cac="${CAC}" xmlns:cbc="${CBC}">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${xml(invoice.invoice_number)}</cbc:ID><cbc:IssueDate>${date(invoice.issue_date)}</cbc:IssueDate>${!model.isCreditNote && invoice.due_date ? `<cbc:DueDate>${invoice.due_date}</cbc:DueDate>` : ''}<cbc:${typeElement}>${type}</cbc:${typeElement}>${notes}<cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode><cbc:BuyerReference>${xml(invoice.buyer_reference)}</cbc:BuyerReference>${original}
  <cac:AccountingSupplierParty>${partyXml(seller, true)}</cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>${partyXml(buyer, false)}</cac:AccountingCustomerParty>
  <cac:Delivery><cbc:ActualDeliveryDate>${invoice.delivery_date}</cbc:ActualDeliveryDate></cac:Delivery>
  ${!model.isCreditNote && seller.iban ? `<cac:PaymentMeans><cbc:PaymentMeansCode>58</cbc:PaymentMeansCode><cac:PayeeFinancialAccount><cbc:ID>${xml(seller.iban)}</cbc:ID></cac:PayeeFinancialAccount></cac:PaymentMeans>` : ''}
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">${amount(sign * totals.vatTotalCents)}</cbc:TaxAmount>${taxGroups}</cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="EUR">${amount(sign * totals.subtotalCents)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="EUR">${amount(sign * totals.subtotalCents)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="EUR">${amount(sign * totals.totalCents)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="EUR">${amount(sign * totals.totalCents)}</cbc:PayableAmount></cac:LegalMonetaryTotal>
  ${lineXml}
</${root}>`;
}
