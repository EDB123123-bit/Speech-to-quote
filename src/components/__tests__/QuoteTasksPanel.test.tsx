// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import QuoteTasksPanel from '@/components/QuoteTasksPanel';
import type { QuoteTask } from '@/lib/supabase/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/taken/actions', () => ({
  createQuoteTask: vi.fn(),
  updateQuoteTask: vi.fn(),
  deleteQuoteTask: vi.fn(),
}));

const task: QuoteTask = {
  id: 'task-1',
  contractor_id: 'contractor-1',
  quote_id: 'quote-1',
  title: 'Werfbezoek plannen',
  status: 'todo',
  due_date: '2026-08-30',
  activated_at: null,
  created_at: '2026-08-22T10:00:00Z',
  updated_at: '2026-08-22T10:00:00Z',
};

describe('QuoteTasksPanel', () => {
  it('shows prepared draft tasks inside the quote editor with their deadline', () => {
    render(<QuoteTasksPanel quoteId="quote-1" quoteStatus="draft" initialTasks={[task]} />);

    expect(screen.getByText(/verschijnen pas in Taken nadat de offerte is aanvaard/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue('Werfbezoek plannen')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-08-30')).toBeInTheDocument();
    expect(screen.getByText('Voorbereid')).toBeInTheDocument();
  });

  it('labels tasks as active after quote acceptance', () => {
    render(<QuoteTasksPanel quoteId="quote-1" quoteStatus="accepted" initialTasks={[{ ...task, activated_at: '2026-08-24T09:00:00Z' }]} />);

    expect(screen.getByText(/staan ook in het centrale takenoverzicht/i)).toBeInTheDocument();
    expect(screen.getByText('Actief')).toBeInTheDocument();
  });

  it('offers only todo and done statuses', () => {
    render(<QuoteTasksPanel quoteId="quote-1" quoteStatus="draft" initialTasks={[task]} />);

    const options = screen.getAllByRole('option').map((option) => option.getAttribute('value'));
    expect(options).toEqual(['todo', 'done']);
  });
});
