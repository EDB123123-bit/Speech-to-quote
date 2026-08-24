export type TaskStatusFilter = 'all' | 'todo' | 'done';
export type TaskDeadlineFilter = 'all' | 'overdue' | 'today' | 'upcoming' | 'no_deadline';
export type TaskSort = 'deadline_asc' | 'deadline_desc' | 'created_desc';
export type TaskGrouping = 'none' | 'quote';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseTaskStatus(value: string | string[] | undefined): TaskStatusFilter {
  const parsed = one(value);
  return parsed === 'todo' || parsed === 'done' ? parsed : 'all';
}

export function parseTaskDeadline(value: string | string[] | undefined): TaskDeadlineFilter {
  const parsed = one(value);
  return parsed === 'overdue' || parsed === 'today' || parsed === 'upcoming' || parsed === 'no_deadline'
    ? parsed
    : 'all';
}

export function parseTaskSort(value: string | string[] | undefined): TaskSort {
  const parsed = one(value);
  return parsed === 'deadline_desc' || parsed === 'created_desc' ? parsed : 'deadline_asc';
}

export function parseTaskGrouping(value: string | string[] | undefined): TaskGrouping {
  return one(value) === 'quote' ? 'quote' : 'none';
}

export function parseQuoteFilter(value: string | string[] | undefined): string {
  const parsed = one(value)?.trim() ?? '';
  return UUID.test(parsed) ? parsed : '';
}

export function todayInBrussels(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
