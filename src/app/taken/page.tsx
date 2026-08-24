import Link from 'next/link';
import { requireContractor } from '@/lib/auth/require-contractor';
import {
  parseQuoteFilter,
  parseTaskDeadline,
  parseTaskGrouping,
  parseTaskSort,
  parseTaskStatus,
  todayInBrussels,
} from '@/lib/tasks/filters';
import { setQuoteTaskStatus } from './actions';
import type { Quote, QuoteTask } from '@/lib/supabase/types';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
type TaskQuote = Pick<Quote, 'id' | 'quote_number' | 'customer_name' | 'status'>;
type TaskWithQuote = QuoteTask & { quotes: TaskQuote };

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = parseTaskStatus(params.status);
  const deadline = parseTaskDeadline(params.deadline);
  const sort = parseTaskSort(params.sort);
  const grouping = parseTaskGrouping(params.group);
  const quoteFilter = parseQuoteFilter(params.quote);
  const today = todayInBrussels();
  const { supabase, contractor } = await requireContractor();

  let query = supabase
    .from('quote_tasks')
    .select('*, quotes!inner(id, quote_number, customer_name, status)')
    .eq('contractor_id', contractor.id)
    .eq('quotes.status', 'accepted')
    .not('activated_at', 'is', null);

  if (status !== 'all') query = query.eq('status', status);
  if (quoteFilter) query = query.eq('quote_id', quoteFilter);
  if (deadline === 'overdue') query = query.lt('due_date', today);
  if (deadline === 'today') query = query.eq('due_date', today);
  if (deadline === 'upcoming') query = query.gt('due_date', today);
  if (deadline === 'no_deadline') query = query.is('due_date', null);

  if (sort === 'created_desc') {
    query = query.order('created_at', { ascending: false });
  } else {
    query = query.order('due_date', {
      ascending: sort === 'deadline_asc',
      nullsFirst: false,
    }).order('created_at', { ascending: false });
  }

  const [{ data }, { data: acceptedQuotes }] = await Promise.all([
    query,
    supabase
      .from('quotes')
      .select('id, quote_number, customer_name, status')
      .eq('contractor_id', contractor.id)
      .eq('status', 'accepted')
      .order('accepted_at', { ascending: false, nullsFirst: false }),
  ]);

  const tasks = (data ?? []) as unknown as TaskWithQuote[];
  const groups = grouping === 'quote'
    ? groupByQuote(tasks)
    : [{ key: 'all', label: '', tasks }];

  return (
    <main className="page-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">Operaties</p>
          <h1 className="page-title">Taken</h1>
          <p className="page-subtitle">Alleen taken van aanvaarde offertes worden hier actief.</p>
        </div>
      </header>

      <form className="card mb-6 grid gap-3 md:grid-cols-5" method="get">
        <label className="label flex flex-col gap-1">Status
          <select className="field min-h-12" name="status" defaultValue={status}>
            <option value="all">Alle statussen</option>
            <option value="todo">Te doen</option>
            <option value="done">Klaar</option>
          </select>
        </label>
        <label className="label flex flex-col gap-1">Deadline
          <select className="field min-h-12" name="deadline" defaultValue={deadline}>
            <option value="all">Alle deadlines</option>
            <option value="overdue">Te laat</option>
            <option value="today">Vandaag</option>
            <option value="upcoming">Na vandaag</option>
            <option value="no_deadline">Geen deadline</option>
          </select>
        </label>
        <label className="label flex flex-col gap-1">Offerte
          <select className="field min-h-12" name="quote" defaultValue={quoteFilter}>
            <option value="">Alle offertes</option>
            {(acceptedQuotes ?? []).map((quote) => (
              <option key={quote.id} value={quote.id}>
                {quote.quote_number} · {quote.customer_name ?? 'Nog geen klantnaam'}
              </option>
            ))}
          </select>
        </label>
        <label className="label flex flex-col gap-1">Sorteren
          <select className="field min-h-12" name="sort" defaultValue={sort}>
            <option value="deadline_asc">Deadline oplopend</option>
            <option value="deadline_desc">Deadline aflopend</option>
            <option value="created_desc">Nieuwste eerst</option>
          </select>
        </label>
        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <label className="label flex flex-col gap-1">Groeperen
            <select className="field min-h-12" name="group" defaultValue={grouping}>
              <option value="none">Niet groeperen</option>
              <option value="quote">Per offerte</option>
            </select>
          </label>
          <button className="btn btn-primary min-h-12" type="submit">Toon</button>
        </div>
      </form>

      {tasks.length === 0 ? (
        <div className="empty-state">
          <strong>Geen actieve taken gevonden</strong>
          Pas de filters aan of bereid taken voor in een offerte.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.key}>
              {group.label && <h2 className="mb-3 text-xl font-extrabold">{group.label}</h2>}
              <div className="flex flex-col gap-3">
                {group.tasks.map((task) => (
                  <TaskRow key={task.id} task={task} today={today} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

function TaskRow({ task, today }: { task: TaskWithQuote; today: string }) {
  const nextStatus = task.status === 'todo' ? 'done' : 'todo';
  const statusAction = setQuoteTaskStatus.bind(null, task.id, nextStatus);
  const overdue = task.status === 'todo' && task.due_date !== null && task.due_date < today;

  return (
    <article className="card flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={`badge ${task.status === 'done' ? 'badge-success' : overdue ? 'badge-critical' : 'badge-neutral'}`}>
            {task.status === 'done' ? 'Klaar' : overdue ? 'Te laat' : 'Te doen'}
          </span>
          <span className="text-sm font-bold text-muted">
            {task.due_date ? `Deadline ${formatDate(task.due_date)}` : 'Geen deadline'}
          </span>
        </div>
        <h2 className={`text-lg font-extrabold ${task.status === 'done' ? 'line-through opacity-60' : ''}`}>{task.title}</h2>
        <Link className="mt-1 inline-block text-sm font-bold underline" href={`/offertes/${task.quote_id}`}>
          {task.quotes.quote_number} · {task.quotes.customer_name ?? 'Nog geen klantnaam'}
        </Link>
      </div>
      <form action={statusAction}>
        <button className="btn btn-outline min-h-12 w-full sm:w-auto" type="submit">
          {task.status === 'todo' ? 'Markeer klaar' : 'Terug naar te doen'}
        </button>
      </form>
    </article>
  );
}

function groupByQuote(tasks: TaskWithQuote[]) {
  const grouped = new Map<string, { key: string; label: string; tasks: TaskWithQuote[] }>();
  for (const task of tasks) {
    const group = grouped.get(task.quote_id) ?? {
      key: task.quote_id,
      label: `${task.quotes.quote_number} · ${task.quotes.customer_name ?? 'Nog geen klantnaam'}`,
      tasks: [],
    };
    group.tasks.push(task);
    grouped.set(task.quote_id, group);
  }
  return [...grouped.values()];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('nl-BE', { dateStyle: 'medium', timeZone: 'Europe/Brussels' })
    .format(new Date(`${value}T12:00:00Z`));
}
