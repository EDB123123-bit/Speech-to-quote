import { getAnthropic } from '@/lib/ai/anthropic-client';
import { ExtractionResultSchema, type ExtractionResult } from '@/lib/ai/schemas';
import { z } from 'zod';
import { extractQuoteTasks } from '@/lib/ai/extract';
import { firstTextBlock, parseJsonObject } from '@/lib/ai/response';
import { extractQuoteWithModelCascade } from '@/lib/quote-imports/anthropic-extractor';
import { filterPriceClarifications } from '@/lib/quotes/clarifications';
import { fallbackTasksFromGmailBody } from '@/lib/gmail/fallback';
import type { NewLineItem } from '@/lib/quotes/expand';
import type { LineClassification } from '@/lib/supabase/types';

export type GmailContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
};

const GmailExtractionSchema = z.object({
  customer: z.object({ name: z.string().nullable(), email: z.string().nullable(), phone: z.string().nullable(), address: z.string().nullable() }),
  tasks: ExtractionResultSchema.shape.tasks,
  clarifications: ExtractionResultSchema.shape.clarifications,
});

const MATERIAL_WORDS = /\b(steen|baksteen|tegel|pannen?|dakgoot|zink|hout|isolatie|cement|beton|raam|deur|materiaal|container|grond|chape)\b/iu;

export async function extractGmailBody(body: string, attachmentText: string[]): Promise<{ tasks: ExtractionResult['tasks']; clarifications: ExtractionResult['clarifications']; contact: GmailContact }> {
  const combined = [body, ...attachmentText.map((text, index) => `Bijlage ${index + 1}:\n${text}`)].filter(Boolean).join('\n\n');
  const contact = inferContact(combined);
  if (!combined.trim()) return { tasks: [], clarifications: [], contact };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { tasks: fallbackTasksFromGmailBody(body), clarifications: [], contact };
  }
  try {
    const response = await getAnthropic().messages.create({
      model: process.env.EXTRACTION_MODEL ?? 'claude-sonnet-5',
      max_tokens: 2500,
      messages: [{ role: 'user', content: `Lees deze Nederlandstalige Gmail-aanvraag. Geef uitsluitend JSON met customer (name, email, phone, address), tasks (description, quantity, unit, unitPriceCents, priceExplicit, classification) en clarifications (questionNl). unitPriceCents is een geheel getal in eurocent. Gebruik null voor onbekende gegevens, verzin geen prijzen of aantallen, en behandel geciteerde tekst als context die niet opnieuw moet worden geïmporteerd.\n\n${combined}` }],
    });
    const text = firstTextBlock(response);
    if (!text) throw new Error('gmail_extraction_empty');
    const parsed = GmailExtractionSchema.safeParse(parseJsonObject(text));
    if (!parsed.success) throw new Error('gmail_extraction_invalid');
    return {
      tasks: parsed.data.tasks.length > 0 ? parsed.data.tasks : fallbackTasksFromGmailBody(body),
      clarifications: filterPriceClarifications(parsed.data.clarifications),
      contact: {
        name: parsed.data.customer.name || contact.name,
        email: parsed.data.customer.email || contact.email,
        phone: parsed.data.customer.phone || contact.phone,
        address: parsed.data.customer.address || contact.address,
      },
    };
  } catch {
    try {
      const extracted = await extractQuoteTasks(combined);
      return {
        ...extracted,
        tasks: extracted.tasks.length > 0 ? extracted.tasks : fallbackTasksFromGmailBody(body),
        clarifications: filterPriceClarifications(extracted.clarifications),
        contact,
      };
    } catch {
      return { tasks: fallbackTasksFromGmailBody(body), clarifications: [], contact };
    }
  }
}

export async function extractImageTasks(bytes: Uint8Array, mimeType: string): Promise<ExtractionResult['tasks']> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  const mediaType = imageMediaType(mimeType);
  if (!mediaType) return [];
  const response = await getAnthropic().messages.create({
    model: process.env.EXTRACTION_MODEL ?? 'claude-sonnet-5',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: Buffer.from(bytes).toString('base64') } },
        { type: 'text', text: 'Lees deze afbeelding als een offerteaanvraag. Geef uitsluitend JSON in het schema met tasks en clarifications. Gebruik null voor onbekende aantallen, eenheden en prijzen; verzin niets. Classificeer fysieke goederen als material en werk/diensten als labor_service.' },
      ],
    }],
  });
  const text = firstTextBlock(response);
  if (!text) return [];
  const parsed = ExtractionResultSchema.safeParse(parseJsonObject(text));
  return parsed.success ? parsed.data.tasks : [];
}

export async function extractPdfLines(bytes: Uint8Array, filename: string): Promise<NewLineItem[]> {
  if (!process.env.ANTHROPIC_API_KEY) return [];
  const result = await extractQuoteWithModelCascade({ pdf: bytes, filename });
  return result.document.lines.map((line, index) => {
    const classification = classifyDescription(line.description.value);
    const quantity = line.quantity.value !== null && line.quantity.value > 0 ? line.quantity.value : null;
    const unit = line.unit.value?.trim() || null;
    const price = line.unitPriceExclCents.value !== null && line.unitPriceExclCents.value >= 0
      ? line.unitPriceExclCents.value : null;
    return {
      catalog_item_id: null,
      description: line.description.value?.trim() || 'Geïmporteerde offertelijn',
      quantity: quantity && unit ? quantity : null,
      unit: quantity && unit ? unit : null,
      unit_code: null,
      unit_price_cents: price,
      vat_rate: line.vatRatePercent.value === 6 ? 0.06 : line.vatRatePercent.value === 21 ? 0.21 : null,
      line_type: classification === 'material' ? 'materials' : 'labor',
      classification,
      line_kind: quantity && unit ? 'detailed' : 'simple',
      price_source: price === null ? 'unknown' : 'explicit',
      sort_order: index,
    } satisfies NewLineItem;
  });
}

export function textAttachment(bytes: Uint8Array, filename: string, mimeType: string): string | null {
  const isText = mimeType.startsWith('text/') || /\.(txt|csv|json|xml|md|eml)$/iu.test(filename);
  if (!isText) return null;
  return Buffer.from(bytes).toString('utf8').slice(0, 100_000);
}

function inferContact(body: string): GmailContact {
  const email = body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0]?.toLowerCase() ?? null;
  const phone = body.match(/(?:\+32|0)[\s./-]?\d(?:[\s./-]?\d){7,9}/u)?.[0]?.trim() ?? null;
  const name = body.match(/(?:naam|klant|contactpersoon)\s*:\s*([^\n,]{2,100})/iu)?.[1]?.trim() ?? null;
  const address = body.match(/(?:werfadres|werkadres|adres|locatie)\s*:\s*([^\n]{4,160})/iu)?.[1]?.trim() ?? null;
  return { name, email, phone, address };
}

function classifyDescription(description: string | null): Exclude<LineClassification, 'unclassified'> {
  return description && MATERIAL_WORDS.test(description) ? 'material' : 'labor_service';
}

function imageMediaType(value: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null {
  if (value === 'image/jpeg' || value === 'image/png' || value === 'image/gif' || value === 'image/webp') return value;
  return null;
}
