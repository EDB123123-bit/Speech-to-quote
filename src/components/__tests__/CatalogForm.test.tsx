// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CatalogItem } from '@/lib/supabase/types';

const { createCatalogItem, deleteCatalogItem } = vi.hoisted(() => ({
  createCatalogItem: vi.fn(),
  deleteCatalogItem: vi.fn(),
}));

vi.mock('@/app/instellingen/catalog-actions', () => ({
  createCatalogItem,
  deleteCatalogItem,
}));

const CatalogForm = (await import('@/components/CatalogForm')).default;

const item: CatalogItem = {
  id: 'item-1',
  contractor_id: 'contractor-1',
  name: 'Dakpannen leggen',
  unit: 'm²',
  materials_price_cents: 3000,
  labor_price_cents: 1500,
  vat_rate: 0.06,
  created_at: '2026-01-01T00:00:00.000Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CatalogForm — delete error handling', () => {
  it('surfaces the Dutch error message from a failed delete', async () => {
    deleteCatalogItem.mockRejectedValueOnce(new Error('Verwijderen mislukt. Probeer opnieuw.'));
    const user = userEvent.setup();

    render(<CatalogForm items={[item]} />);

    await user.click(screen.getByRole('button', { name: `Verwijder ${item.name}` }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Verwijderen mislukt. Probeer opnieuw.');
    expect(deleteCatalogItem).toHaveBeenCalledWith(item.id);
  });

  it('falls back to a generic Dutch message when the rejection has no message', async () => {
    deleteCatalogItem.mockRejectedValueOnce('boom');
    const user = userEvent.setup();

    render(<CatalogForm items={[item]} />);

    await user.click(screen.getByRole('button', { name: `Verwijder ${item.name}` }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Verwijderen mislukt. Probeer opnieuw.');
  });

  it('does not show an error before any delete is attempted', () => {
    render(<CatalogForm items={[item]} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
