import { describe, it, expect } from 'vitest';
import { parseProfileInput } from '@/app/instellingen/parse';

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

describe('parseProfileInput', () => {
  it('parses all fields', () => {
    const result = parseProfileInput(
      formOf({
        company_name: 'Dakwerken Janssens',
        address: 'Kerkstraat 1, 9000 Gent',
        vat_number: 'BE0123456789',
        phone: '0470123456',
      }),
    );
    expect(result).toEqual({
      company_name: 'Dakwerken Janssens',
      address: 'Kerkstraat 1, 9000 Gent',
      vat_number: 'BE0123456789',
      phone: '0470123456',
    });
  });

  it('trims whitespace', () => {
    const result = parseProfileInput(formOf({ company_name: '  Dakwerken  ' }));
    expect(result.company_name).toBe('Dakwerken');
  });

  it('turns blank optional fields into null', () => {
    const result = parseProfileInput(formOf({ company_name: 'X', address: '   ' }));
    expect(result.address).toBeNull();
    expect(result.vat_number).toBeNull();
  });

  it('rejects a blank company name with a Dutch message', () => {
    expect(() => parseProfileInput(formOf({ company_name: '  ' }))).toThrow('Bedrijfsnaam is verplicht');
  });
});
