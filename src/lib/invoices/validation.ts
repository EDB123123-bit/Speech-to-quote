const NON_ALPHANUMERIC = /[^A-Z0-9]/gu;

export function normalizeBelgianEnterpriseNumber(value: string | null | undefined): string | null {
  const digits = value?.replace(/\D/gu, '') ?? '';
  return digits.length === 10 ? digits : null;
}

export function isValidBelgianEnterpriseNumber(value: string | null | undefined): boolean {
  const digits = normalizeBelgianEnterpriseNumber(value);
  if (!digits) return false;
  const base = Number(digits.slice(0, 8));
  const checksum = Number(digits.slice(8));
  return 97 - (base % 97) === checksum;
}

export function normalizeBelgianVatNumber(value: string | null | undefined): string | null {
  const enterprise = normalizeBelgianEnterpriseNumber(value);
  return enterprise ? `BE${enterprise}` : null;
}

export function isValidBelgianVatNumber(value: string | null | undefined): boolean {
  return isValidBelgianEnterpriseNumber(value);
}

export function normalizeIban(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(NON_ALPHANUMERIC, '');
}

export function isValidIban(value: string | null | undefined): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/u.test(iban)) return false;
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const numeric = /[A-Z]/u.test(character) ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of numeric) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function deriveBelgianPeppolParticipantId(value: string | null | undefined): string | null {
  const enterprise = normalizeBelgianEnterpriseNumber(value);
  return enterprise ? `0208:${enterprise}` : null;
}

export function assertBelgianSellerIdentifiers(input: {
  enterpriseNumber: string | null | undefined;
  vatNumber: string | null | undefined;
  iban: string | null | undefined;
}): void {
  const enterprise = normalizeBelgianEnterpriseNumber(input.enterpriseNumber);
  const vat = normalizeBelgianVatNumber(input.vatNumber);
  if (!enterprise || !isValidBelgianEnterpriseNumber(enterprise)) throw new Error('Het KBO-nummer is ongeldig.');
  if (!vat || !isValidBelgianVatNumber(vat) || vat !== `BE${enterprise}`) throw new Error('Het btw-nummer is ongeldig of komt niet overeen met het KBO-nummer.');
  if (!isValidIban(input.iban)) throw new Error('Het IBAN is ongeldig.');
}
