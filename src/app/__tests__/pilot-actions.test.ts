import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  insert: vi.fn(),
  from: vi.fn(),
  after: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminSupabase: () => ({ from: mocks.from }),
}));

vi.mock('next/server', () => ({
  after: mocks.after,
}));

import { requestPilot } from '../pilot-actions';

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const valid = { name: 'Jan Peeters', phone: '0470 12 34 56', region: 'vlaanderen' };

describe('requestPilot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
  });

  it('stores a valid request and thanks the visitor by first name', async () => {
    await expect(requestPilot({ status: 'idle' }, form(valid))).resolves.toEqual({ status: 'sent', firstName: 'Jan' });

    expect(mocks.from).toHaveBeenCalledWith('pilot_requests');
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Jan Peeters', region: 'vlaanderen' }));
  });

  it('returns field errors without touching the database', async () => {
    const state = await requestPilot({ status: 'idle' }, form({ name: 'Jan' }));

    expect(state).toMatchObject({ status: 'invalid', fieldErrors: { phone: expect.any(String), region: expect.any(String) } });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('silently drops submissions that filled the hidden bot field', async () => {
    const state = await requestPilot({ status: 'idle' }, form({ ...valid, website: 'https://spam.example' }));

    expect(state).toEqual({ status: 'sent', firstName: '' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('reports a storage failure so the page can offer WhatsApp instead', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.insert.mockResolvedValue({ error: { message: 'relation "pilot_requests" does not exist' } });

    await expect(requestPilot({ status: 'idle' }, form(valid))).resolves.toEqual({ status: 'failed' });
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('[pilot]'), expect.not.stringContaining('Peeters'));
    consoleError.mockRestore();
  });

  it('pings the configured chat webhook after responding', async () => {
    vi.stubEnv('PILOT_LEAD_WEBHOOK_URL', 'https://hooks.slack.test/abc');
    const fetchMock = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetchMock);

    await requestPilot({ status: 'idle' }, form(valid));
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();

    await mocks.after.mock.calls[0][0]();
    expect(fetchMock).toHaveBeenCalledWith('https://hooks.slack.test/abc', expect.objectContaining({ method: 'POST' }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).text).toContain('Jan Peeters');
    vi.unstubAllGlobals();
  });

  it('does not schedule a notification when no webhook is configured', async () => {
    await requestPilot({ status: 'idle' }, form(valid));
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
