import { describe, expect, it } from 'vitest';
import {
  INTERACTIVE_IMPORT_MAX_DOCUMENTS,
  MAX_BATCH_DOCUMENTS,
  quoteImportProcessingMode,
} from '../constants';

describe('quote import processing thresholds', () => {
  it('keeps 20 quotes interactive and reserves 21 through 25 for batch import', () => {
    expect(INTERACTIVE_IMPORT_MAX_DOCUMENTS).toBe(20);
    expect(MAX_BATCH_DOCUMENTS).toBe(25);
    expect(quoteImportProcessingMode(20)).toBe('interactive');
    expect(quoteImportProcessingMode(21)).toBe('provider_batch');
    expect(quoteImportProcessingMode(25)).toBe('provider_batch');
  });
});
