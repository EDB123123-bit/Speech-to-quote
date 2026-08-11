export function validateStageName(raw: string): string {
  const name = (raw ?? '').trim();
  if (!name) throw new Error('Naam is verplicht');
  return name;
}
