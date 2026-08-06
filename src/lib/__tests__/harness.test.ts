import { describe, it, expect } from 'vitest';

describe('test harness', () => {
  it('runs tests and resolves the @ path alias', async () => {
    const mod = await import('@/lib/version');
    expect(mod.APP_VERSION).toBe('0.1.0');
  });
});
