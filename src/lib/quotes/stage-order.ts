type OrderedItem = { sort_order: number };
type IdentifiedItem = { id: string; sort_order: number };

export function nextSortOrder(existing: OrderedItem[]): number {
  if (existing.length === 0) return 0;
  return Math.max(...existing.map((s) => s.sort_order)) + 1;
}

export function canDeleteStage(
  occupiedCount: number,
): { allowed: true } | { allowed: false; reason: string } {
  if (occupiedCount === 0) return { allowed: true };
  return {
    allowed: false,
    reason: `Verplaats eerst de ${occupiedCount} offerte(s) uit deze fase voordat je ze verwijdert.`,
  };
}

export function swapSortOrder(
  stages: IdentifiedItem[],
  id: string,
  direction: 'up' | 'down',
): [IdentifiedItem, IdentifiedItem] | null {
  const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const index = sorted.findIndex((s) => s.id === id);
  if (index === -1) return null;

  const neighborIndex = direction === 'up' ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= sorted.length) return null;

  const current = sorted[index];
  const neighbor = sorted[neighborIndex];
  return [
    { id: current.id, sort_order: neighbor.sort_order },
    { id: neighbor.id, sort_order: current.sort_order },
  ];
}
