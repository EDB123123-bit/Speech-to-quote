import { formatEuros } from '@/lib/money/totals';
import type { CanonicalInvoice } from '@/lib/invoices/model';
import { vatLabel, REVERSE_CHARGE_NOTE_NL, REDUCED_VAT_DECLARATION_NL } from '@/lib/invoices/constants';

export function buildInvoiceViewModel(model: CanonicalInvoice) {
  // CreditNote is the legal reversal semantic. Its displayed amounts remain positive.
  const sign = 1;
  return {
    title: model.isCreditNote ? 'Creditnota' : 'Factuur',
    number: model.invoice.invoice_number ?? 'Concept',
    issueDate: model.invoice.issue_date ?? new Date().toISOString().slice(0, 10),
    deliveryDate: model.invoice.delivery_date,
    dueDate: model.isCreditNote ? null : model.invoice.due_date,
    seller: model.seller,
    buyer: model.buyer,
    lines: model.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitCode: line.unit_code,
      unitPrice: formatEuros(sign * line.unit_price_cents),
      vat: line.vat_category === 'AE' ? 'AE' : vatLabel(line.vat_rate),
      total: formatEuros(sign * line.line_total_cents),
    })),
    groups: model.totals.groups.map((group) => ({
      label: group.vatCategory === 'AE' ? 'Verlegging van heffing' : `Btw ${vatLabel(group.vatRate)}`,
      subtotal: formatEuros(sign * group.subtotalCents),
      vat: formatEuros(sign * group.vatAmountCents),
    })),
    subtotal: formatEuros(sign * model.totals.subtotalCents),
    vatTotal: formatEuros(sign * model.totals.vatTotalCents),
    total: formatEuros(sign * model.totals.totalCents),
    buyerReference: model.invoice.buyer_reference,
    paymentIban: model.isCreditNote ? null : model.seller.iban,
    note: model.invoice.vat_treatment === 'reverse_charge'
      ? REVERSE_CHARGE_NOTE_NL
      : model.invoice.reduced_vat_declaration ?? (model.invoice.reduced_vat_confirmed ? REDUCED_VAT_DECLARATION_NL : null),
  };
}
