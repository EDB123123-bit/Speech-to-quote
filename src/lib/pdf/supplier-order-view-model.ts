import { formatEuros } from '@/lib/money/totals';
import type { Contractor, Quote, Supplier, SupplierOrder, SupplierOrderLine } from '@/lib/supabase/types';

export type SupplierOrderPdfModel = {
  orderNumber: string;
  date: string;
  contractor: {
    name: string;
    address: string;
    vatNumber: string;
    email: string;
    phone: string;
  };
  supplier: {
    name: string;
    address: string;
    vatNumber: string;
    contactPerson: string;
    email: string;
    phone: string;
  };
  customer: {
    name: string;
    deliveryAddress: string;
  };
  quote: {
    number: string;
    kindLabel: string;
    customerName: string;
  };
  lines: Array<{
    description: string;
    quantity: string;
    unit: string;
    purchaseUnitPrice: string;
    lineTotal: string;
  }>;
};

export function buildSupplierOrderViewModel(args: {
  contractor: Contractor;
  supplier: Supplier;
  order: SupplierOrder;
  quote: Quote;
  lines: SupplierOrderLine[];
}): SupplierOrderPdfModel {
  const { contractor, supplier, order, quote } = args;
  return {
    orderNumber: order.order_number,
    date: (order.sent_at ?? order.created_at).slice(0, 10),
    contractor: {
      name: contractor.company_name,
      address: contractor.street || contractor.address
        ? [contractor.street, contractor.postal_code, contractor.city].filter(Boolean).join(', ') || contractor.address || ''
        : '',
      vatNumber: contractor.vat_number ?? '',
      email: contractor.email ?? '',
      phone: contractor.phone ?? '',
    },
    supplier: {
      name: supplier.company_name,
      address: supplier.address ?? '',
      vatNumber: supplier.vat_number ?? '',
      contactPerson: supplier.contact_person ?? '',
      email: supplier.email ?? '',
      phone: supplier.phone ?? '',
    },
    customer: {
      name: quote.customer_name ?? 'Klant onbekend',
      deliveryAddress: order.delivery_address ?? quote.customer_address ?? '',
    },
    quote: {
      number: quote.quote_number ?? quote.id.slice(0, 8).toUpperCase(),
      kindLabel: quote.quote_kind === 'meerwerk' ? 'Meerwerkofferte' : 'Standaardofferte',
      customerName: quote.customer_name ?? 'Klant onbekend',
    },
    // Intentionally only supplier-order lines are included. Customer selling
    // prices and quote margin data never enter this view model.
    lines: [...args.lines]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((line) => ({
        description: line.description,
        quantity: formatQuantity(line.quantity),
        unit: line.unit ?? '',
        purchaseUnitPrice: line.purchase_unit_price_cents === null ? '—' : formatEuros(line.purchase_unit_price_cents),
        lineTotal: line.purchase_unit_price_cents === null
          ? '—'
          : formatEuros(Math.round(line.quantity * line.purchase_unit_price_cents)),
      })),
  };
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('nl-BE', { maximumFractionDigits: 3 }).format(value);
}
