import { renderToBuffer } from '@react-pdf/renderer';
import InvoiceDocument from './InvoiceDocument';
import type { CanonicalInvoice } from '@/lib/invoices/model';

export async function renderInvoicePdf(model: CanonicalInvoice): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument model={model} />);
}
