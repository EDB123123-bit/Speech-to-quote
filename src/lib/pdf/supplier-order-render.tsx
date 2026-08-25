import { renderToBuffer } from '@react-pdf/renderer';
import SupplierOrderDocument from './SupplierOrderDocument';
import { buildSupplierOrderViewModel } from './supplier-order-view-model';
import type { Contractor, Quote, Supplier, SupplierOrder, SupplierOrderLine } from '@/lib/supabase/types';

export async function renderSupplierOrderPdf(args: {
  contractor: Contractor;
  supplier: Supplier;
  order: SupplierOrder;
  quote: Quote;
  lines: SupplierOrderLine[];
}): Promise<Buffer> {
  return renderToBuffer(<SupplierOrderDocument model={buildSupplierOrderViewModel(args)} />);
}
