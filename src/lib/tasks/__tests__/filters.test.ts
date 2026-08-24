import { describe, expect, it } from 'vitest';
import {
  parseQuoteFilter,
  parseTaskDeadline,
  parseTaskGrouping,
  parseTaskSort,
  parseTaskStatus,
  todayInBrussels,
} from '@/lib/tasks/filters';

describe('task overview filters', () => {
  it('accepts only the V1 task statuses', () => {
    expect(parseTaskStatus('todo')).toBe('todo');
    expect(parseTaskStatus('done')).toBe('done');
    expect(parseTaskStatus('in_progress')).toBe('all');
  });

  it('normalizes deadline, sorting, grouping, and quote inputs', () => {
    expect(parseTaskDeadline('overdue')).toBe('overdue');
    expect(parseTaskDeadline('later')).toBe('all');
    expect(parseTaskSort('deadline_desc')).toBe('deadline_desc');
    expect(parseTaskSort(undefined)).toBe('deadline_asc');
    expect(parseTaskGrouping('quote')).toBe('quote');
    expect(parseTaskGrouping('customer')).toBe('none');
    expect(parseQuoteFilter([' 8b14f1f4-3ab6-4a28-82ea-196f2022ec5e ', 'invalid'])).toBe('8b14f1f4-3ab6-4a28-82ea-196f2022ec5e');
    expect(parseQuoteFilter('quote-1')).toBe('');
  });

  it('uses the Brussels calendar date around a UTC day boundary', () => {
    expect(todayInBrussels(new Date('2026-08-22T22:30:00Z'))).toBe('2026-08-23');
  });
});
