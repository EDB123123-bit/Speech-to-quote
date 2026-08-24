import { describe, expect, it } from 'vitest';
import { fallbackTasksFromGmailBody } from '../fallback';

describe('fallbackTasksFromGmailBody', () => {
  it('keeps a readable Gmail request useful when model extraction returns no tasks', () => {
    const tasks = fallbackTasksFromGmailBody(
      'Hallo,\n\nIk zoek een offerte voor een dakherstelling van 50m2.\nEr is PVC nodig, dakpannen en 3 veluxen.',
    );

    expect(tasks.map((task) => task.description)).toEqual([
      'Dakherstelling',
      'PVC',
      'Dakpannen',
      'Veluxen',
    ]);
    expect(tasks[0]).toMatchObject({ quantity: 50, unit: 'm²', unitPriceCents: null, priceExplicit: false });
    expect(tasks[1].classification).toBe('material');
    expect(tasks[3]).toMatchObject({ quantity: 3, unit: 'stuk', classification: 'material' });
  });

  it('does not turn greetings or contact fields into quote lines', () => {
    expect(fallbackTasksFromGmailBody('Beste,\nNaam: Jan\nE-mail: jan@example.com')).toEqual([]);
  });

  it('never invents a zero price or VAT value', () => {
    const [task] = fallbackTasksFromGmailBody('Graag een offerte voor de dakgoot herstellen.');
    expect(task).toMatchObject({ unitPriceCents: null, priceExplicit: false });
    expect(task).not.toHaveProperty('vatRate');
  });
});
