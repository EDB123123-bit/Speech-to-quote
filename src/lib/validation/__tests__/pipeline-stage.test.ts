import { describe, it, expect } from 'vitest';
import { validateStageName } from '@/lib/validation/pipeline-stage';

describe('validateStageName', () => {
  it('trims and accepts a normal name', () => {
    expect(validateStageName('  Gewonnen  ')).toBe('Gewonnen');
  });

  it('rejects an empty name', () => {
    expect(() => validateStageName('')).toThrow('Naam is verplicht');
  });

  it('rejects a whitespace-only name', () => {
    expect(() => validateStageName('   ')).toThrow('Naam is verplicht');
  });
});
