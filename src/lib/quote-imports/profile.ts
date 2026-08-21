import { ExtractedQuoteDocumentSchema } from './schema';

type SellerSuggestion = {
  companyName: string | null;
  address: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  vatNumber: string | null;
  enterpriseNumber: string | null;
  email: string | null;
  phone: string | null;
  iban: string | null;
  observationCount: number;
};

function clean(value: string | null): string | null {
  return value?.trim() || null;
}

export function dominantSellerSuggestion(payloads: unknown[]): SellerSuggestion | null {
  const parsed = payloads.flatMap((payload) => {
    const result = ExtractedQuoteDocumentSchema.safeParse(payload);
    return result.success && result.data.documentType === 'quote' ? [result.data] : [];
  });
  if (!parsed.length) return null;

  const groups = new Map<string, typeof parsed>();
  for (const document of parsed) {
    const seller = document.seller;
    const key = clean(seller.enterpriseNumber.value)?.replace(/\D/gu, '')
      || clean(seller.vatNumber.value)?.replace(/\D/gu, '')
      || clean(seller.name.value)?.toLocaleLowerCase('nl-BE');
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), document]);
  }
  const winner = [...groups.values()].sort((left, right) => right.length - left.length)[0];
  if (!winner?.length) return null;
  const seller = winner[0].seller;
  return {
    companyName: clean(seller.name.value),
    address: clean(seller.address.value),
    street: clean(seller.street.value),
    postalCode: clean(seller.postalCode.value),
    city: clean(seller.city.value),
    vatNumber: clean(seller.vatNumber.value),
    enterpriseNumber: clean(seller.enterpriseNumber.value),
    email: clean(seller.email.value),
    phone: clean(seller.phone.value),
    iban: clean(seller.iban.value),
    observationCount: winner.length,
  };
}
