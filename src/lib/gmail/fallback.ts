import type { ExtractionResult } from '@/lib/ai/schemas';

const MATERIAL_WORDS = /\b(pvc|steen|baksteen|tegel|pannen?|dakgoot|zink|hout|isolatie|cement|beton|raam|ramen|deur|deuren|materiaal|container|grond|chape|velux(?:en)?)\b/iu;
const NON_REQUEST = /^(?:beste|dag|hallo|goeiedag|geachte|alvast bedankt|bedankt|met vriendelijke groet(?:en)?)[,!.\s]*$/iu;
const CONTACT_LINE = /^(?:naam|e-?mail|telefoon|tel\.?|gsm|adres|contactpersoon)\s*:/iu;

function normalizedUnit(value: string | undefined): string | null {
  if (!value) return null;
  if (/^m(?:2|²)$/iu.test(value)) return 'm²';
  if (/^m(?:3|³)$/iu.test(value)) return 'm³';
  if (/^(?:stuk|stuks|st\.?|x)$/iu.test(value)) return 'stuk';
  return value.toLowerCase();
}

function taskFromPhrase(value: string): ExtractionResult['tasks'][number] | null {
  let description = value
    .replace(/^[\s,;:-]+|[\s,;:.!?-]+$/gu, '')
    .replace(/^(?:graag|aub|alstublieft)\s+/iu, '')
    .replace(/^(?:ik\s+(?:zoek|wil|wens)\s+)?(?:graag\s+)?(?:een\s+)?offerte\s+voor\s+/iu, '')
    .replace(/^een\s+/iu, '')
    .replace(/^(?:er\s+(?:is|zijn)|we\s+hebben|ik\s+heb)\s+/iu, '')
    .replace(/\s+nodig\b/iu, '')
    .trim();
  if (!description || NON_REQUEST.test(description) || CONTACT_LINE.test(description)) return null;

  const quantityMatch = description.match(/\b(\d+(?:[.,]\d+)?)\s*(m2|m²|m3|m³|stuks?|st\.?|x)?\b/iu);
  const quantity = quantityMatch ? Number(quantityMatch[1].replace(',', '.')) : null;
  const unit = quantityMatch ? normalizedUnit(quantityMatch[2] || 'stuk') : null;
  if (quantityMatch) {
    description = description
      .replace(new RegExp(`(?:van\\s+)?${quantityMatch[0].replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}`, 'iu'), '')
      .replace(/\s{2,}/gu, ' ')
      .trim();
  }
  if (!description) description = value.trim();

  return {
    description: description[0].toLocaleUpperCase('nl-BE') + description.slice(1),
    quantity: quantity && quantity > 0 ? quantity : null,
    unit: quantity && quantity > 0 ? unit : null,
    unitPriceCents: null,
    priceExplicit: false,
    classification: MATERIAL_WORDS.test(description) ? 'material' : 'labor_service',
  };
}

/**
 * Conservative last-resort extraction for a readable customer request when
 * the configured AI provider is unavailable or returns no valid tasks. It
 * deliberately leaves prices unknown and never turns greetings/contact data
 * into customer-facing quote lines.
 */
export function fallbackTasksFromGmailBody(body: string): ExtractionResult['tasks'] {
  const sentences = body
    .split(/\n+|(?<=[.!?])\s+/u)
    .map((value) => value.trim())
    .filter(Boolean);
  const tasks: ExtractionResult['tasks'] = [];

  for (const sentence of sentences) {
    if (NON_REQUEST.test(sentence) || CONTACT_LINE.test(sentence)) continue;
    const cleaned = sentence.replace(/[.!?]+$/gu, '').trim();
    const isList = /\bnodig\b/iu.test(cleaned) && /,|\sen\s/iu.test(cleaned);
    const phrases = isList
      ? cleaned
        .replace(/^(?:er\s+(?:is|zijn)|we\s+hebben|ik\s+heb)\s+/iu, '')
        .replace(/\s+nodig\b/iu, '')
        .split(/\s*,\s*|\s+en\s+/iu)
      : [cleaned];
    for (const phrase of phrases) {
      const task = taskFromPhrase(phrase);
      if (task) tasks.push(task);
    }
  }

  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = task.description.toLocaleLowerCase('nl-BE');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}
