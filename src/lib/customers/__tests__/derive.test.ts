import { describe, expect, it } from 'vitest';
import {
  countQuotesWithoutCustomer,
  customerSlug,
  deriveCustomers,
  findCustomerBySlug,
  normalizeCustomerName,
  type CustomerQuoteRow,
} from '../derive';

const quote = (overrides: Partial<CustomerQuoteRow> = {}): CustomerQuoteRow => ({
  id: 'quote-1',
  customer_name: 'Anne Bauwens',
  customer_address: 'Edgard Blancquaertlaan 6, 9255 Buggenhout',
  customer_email: null,
  customer_phone: null,
  status: 'draft',
  created_at: '2026-08-01T10:00:00Z',
  ...overrides,
});

const totals = (entries: [string, number][] = []) => new Map(entries);

describe('normalizeCustomerName', () => {
  it('ignores case, accents and repeated spacing', () => {
    expect(normalizeCustomerName('Anne  Bauwens')).toBe('anne bauwens');
    expect(normalizeCustomerName('ANNE BAUWENS')).toBe('anne bauwens');
    expect(normalizeCustomerName('Émile Noël')).toBe('emile noel');
  });
});

describe('customerSlug', () => {
  it('builds a readable url segment', () => {
    expect(customerSlug('Anne Bauwens')).toBe('anne-bauwens');
    expect(customerSlug('Émile Noël')).toBe('emile-noel');
    expect(customerSlug("Bakkerij 't Hoekje")).toBe('bakkerij-t-hoekje');
  });

  it('never produces an empty segment', () => {
    expect(customerSlug('***')).toBe('klant');
  });
});

describe('deriveCustomers', () => {
  it('groups quotes that differ only by spelling into one customer', () => {
    const customers = deriveCustomers([
      quote({ id: 'a', customer_name: 'Anne Bauwens', created_at: '2026-08-01T10:00:00Z' }),
      quote({ id: 'b', customer_name: 'anne  bauwens', created_at: '2026-08-05T10:00:00Z' }),
    ], totals([['a', 10000], ['b', 5000]]));

    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ quoteCount: 2, totalCents: 15000, slug: 'anne-bauwens' });
  });

  it('displays the name as written on the most recent quote', () => {
    const customers = deriveCustomers([
      quote({ id: 'a', customer_name: 'anne bauwens', created_at: '2026-08-01T10:00:00Z' }),
      quote({ id: 'b', customer_name: 'Anne Bauwens', created_at: '2026-08-05T10:00:00Z' }),
    ], totals());
    expect(customers[0].name).toBe('Anne Bauwens');
  });

  it('fills a contact field from an older quote when the newest leaves it blank', () => {
    const customers = deriveCustomers([
      quote({ id: 'a', customer_email: 'anne@example.be', customer_phone: '0470 11 22 33', created_at: '2026-08-01T10:00:00Z' }),
      quote({ id: 'b', customer_email: null, customer_phone: '0470 99 88 77', created_at: '2026-08-05T10:00:00Z' }),
    ], totals());
    expect(customers[0].email).toBe('anne@example.be');
    // The newest quote does carry a phone number, so that one wins.
    expect(customers[0].phone).toBe('0470 99 88 77');
  });

  it('counts drafts and finals separately', () => {
    const customers = deriveCustomers([
      quote({ id: 'a', status: 'draft' }),
      quote({ id: 'b', status: 'final' }),
      quote({ id: 'c', status: 'final' }),
    ], totals());
    expect(customers[0]).toMatchObject({ draftCount: 1, finalCount: 2, quoteCount: 3 });
  });

  it('orders customers by their most recent quote', () => {
    const customers = deriveCustomers([
      quote({ id: 'a', customer_name: 'Oude Klant', created_at: '2026-01-01T10:00:00Z' }),
      quote({ id: 'b', customer_name: 'Nieuwe Klant', created_at: '2026-08-05T10:00:00Z' }),
    ], totals());
    expect(customers.map((customer) => customer.name)).toEqual(['Nieuwe Klant', 'Oude Klant']);
  });

  it('lists a customer’s own quotes newest first', () => {
    const customers = deriveCustomers([
      quote({ id: 'a', created_at: '2026-08-01T10:00:00Z' }),
      quote({ id: 'b', created_at: '2026-08-05T10:00:00Z' }),
    ], totals([['a', 100], ['b', 200]]));
    expect(customers[0].quotes.map((item) => item.id)).toEqual(['b', 'a']);
    expect(customers[0].quotes[0].totalCents).toBe(200);
  });

  it('does not invent a customer for a quote with no name', () => {
    const rows = [quote({ id: 'a', customer_name: null }), quote({ id: 'b', customer_name: '   ' })];
    expect(deriveCustomers(rows, totals())).toEqual([]);
    expect(countQuotesWithoutCustomer(rows)).toBe(2);
  });

  it('falls back to a readable quote number when the column is unset', () => {
    const customers = deriveCustomers([quote({ id: 'abc12345-0000-0000-0000-000000000000' })], totals());
    expect(customers[0].quotes[0].quoteNumber).toBe('ABC12345');
  });

  it('keeps a missing total unknown rather than displaying zero', () => {
    const customers = deriveCustomers([quote({ id: 'a' })], totals());
    expect(customers[0].totalCents).toBeNull();
  });
});

describe('findCustomerBySlug', () => {
  it('finds a customer and returns null for an unknown slug', () => {
    const customers = deriveCustomers([quote()], totals());
    expect(findCustomerBySlug(customers, 'anne-bauwens')?.name).toBe('Anne Bauwens');
    expect(findCustomerBySlug(customers, 'iemand-anders')).toBeNull();
  });
});
