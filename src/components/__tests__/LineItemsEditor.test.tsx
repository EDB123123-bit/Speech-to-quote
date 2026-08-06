// @vitest-environment jsdom
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LineItemsEditor, { toTotalsInput } from '@/components/LineItemsEditor';
import type { QuoteLineItem } from '@/lib/supabase/types';

function item(overrides: Partial<QuoteLineItem> = {}): QuoteLineItem {
  return {
    id: 'line-1',
    quote_id: 'quote-1',
    catalog_item_id: 'cat-1',
    description: 'Dakpannen leggen – materiaal',
    quantity: 80,
    unit: 'm²',
    unit_price_cents: 3000,
    vat_rate: 0.06,
    line_type: 'materials',
    sort_order: 0,
    created_at: '2026-08-06T00:00:00Z',
    ...overrides,
  };
}

// LineItemsEditor's inputs are genuinely controlled: they show `items` as
// passed in via props, and rely on the parent re-rendering with the patched
// array on every change (exactly like the real QuoteEditor parent will).
// A bare `onChange={vi.fn()}` never feeds that update back in, so a
// controlled input would appear to "reject" keystrokes typed after the
// first one — this wrapper closes the loop the way production code does.
function StatefulWrapper({
  initialItems,
  onChange,
}: {
  initialItems: QuoteLineItem[];
  onChange: (items: QuoteLineItem[]) => void;
}) {
  const [items, setItems] = useState(initialItems);
  return (
    <LineItemsEditor
      items={items}
      onChange={(next) => {
        setItems(next);
        onChange(next);
      }}
    />
  );
}

describe('toTotalsInput', () => {
  it('includes fully priced rows', () => {
    expect(toTotalsInput([item()])).toEqual([{ quantity: 80, unitPriceCents: 3000, vatRate: 0.06 }]);
  });

  it('skips rows with no price yet', () => {
    expect(toTotalsInput([item({ unit_price_cents: null })])).toEqual([]);
  });

  it('skips rows with no VAT rate yet', () => {
    expect(toTotalsInput([item({ vat_rate: null })])).toEqual([]);
  });
});

describe('LineItemsEditor', () => {
  it('renders each line item', () => {
    render(<LineItemsEditor items={[item()]} onChange={vi.fn()} />);
    expect(screen.getByDisplayValue('Dakpannen leggen – materiaal')).toBeInTheDocument();
  });

  it('shows the running total', () => {
    render(<LineItemsEditor items={[item()]} onChange={vi.fn()} />);
    // 80 * 3000 = 240000 cents; VAT 6% = 14400; total 254400
    expect(screen.getByTestId('grand-total')).toHaveTextContent('2.544,00');
  });

  it('shows a separate subtotal per VAT rate', () => {
    render(
      <LineItemsEditor
        items={[item(), item({ id: 'line-2', vat_rate: 0.21, unit_price_cents: 1000, quantity: 1 })]}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('vat-group-0.06')).toBeInTheDocument();
    expect(screen.getByTestId('vat-group-0.21')).toBeInTheDocument();
  });

  it('reports a changed quantity', async () => {
    const onChange = vi.fn();
    render(<StatefulWrapper initialItems={[item()]} onChange={onChange} />);

    const input = screen.getByLabelText(/aantal/i);
    await userEvent.clear(input);
    await userEvent.type(input, '90');

    // The visible input must actually accumulate the typed digits — this is
    // what proves the component is genuinely controlled, not a coincidental
    // pass on the final onChange payload alone.
    expect(input).toHaveValue(90);

    expect(onChange).toHaveBeenCalled();
    const last = onChange.mock.calls.at(-1)![0];
    expect(last[0].quantity).toBe(90);
  });

  it('reports a changed VAT rate', async () => {
    const onChange = vi.fn();
    render(<LineItemsEditor items={[item()]} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText(/btw/i), '0.21');

    const last = onChange.mock.calls.at(-1)![0];
    expect(last[0].vat_rate).toBe(0.21);
  });

  it('flags a row that still needs a price or VAT rate', () => {
    render(<LineItemsEditor items={[item({ unit_price_cents: null, vat_rate: null })]} onChange={vi.fn()} />);
    expect(screen.getByText(/vul prijs en btw-tarief aan/i)).toBeInTheDocument();
  });
});
