import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireContractor, UnauthorizedError } from '@/lib/auth/require-contractor';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { fetchGmailMessage } from '@/lib/mailbox/gmail';
import { getMailboxConnectionForProvider } from '@/lib/mailbox/connection';
import { MailboxError } from '@/lib/mailbox/errors';
import { emailFromHeader, hashGmailBody, normalizeGmailBody, senderNameFromHeader } from '@/lib/gmail/normalize';
import { extractGmailBody, extractImageTasks, extractPdfLines, textAttachment } from '@/lib/gmail/extract';
import { applyHistoricalSuggestions, loadHistoricalPriceCandidates } from '@/lib/quotes/historical-suggestions-server';
import { normalizeCustomerName } from '@/lib/customers/derive';
import type { NewLineItem } from '@/lib/quotes/expand';
import type { Customer, QuoteAttachment } from '@/lib/supabase/types';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: Request) {
  let auth: Awaited<ReturnType<typeof requireContractor>>;
  try { auth = await requireContractor(); } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: 'Niet aangemeld' }, { status: 401 });
    throw error;
  }
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Ongeldige aanvraag.' }, { status: 400 }); }
  const messageId = typeof body === 'object' && body !== null && 'messageId' in body ? String(body.messageId).trim() : '';
  if (!messageId || !/^[A-Za-z0-9_-]{1,200}$/u.test(messageId)) return NextResponse.json({ error: 'Kies één geldig Gmail-bericht.' }, { status: 422 });

  try {
    const connection = await getMailboxConnectionForProvider(auth.contractor.id, 'gmail');
    if (!connection) return NextResponse.json({ error: 'Verbind Gmail eerst.', reconnect: true }, { status: 409 });
    const admin = createAdminSupabase();
    const { data: existingImport } = await admin.from('gmail_quote_imports').select('id,quote_id').eq('mailbox_connection_id', connection.id).eq('gmail_message_id', messageId).maybeSingle();
    if (existingImport) return NextResponse.json({ ok: true, alreadyExists: true, importId: existingImport.id, quoteId: existingImport.quote_id });
    const message = await fetchGmailMessage(auth.contractor.id, messageId);
    const normalizedBody = normalizeGmailBody(message.body);
    const bodyHash = hashGmailBody(normalizedBody);
    const attachmentText = message.attachments
      .map((attachment) => textAttachment(attachment.bytes, attachment.filename, attachment.mimeType))
      .filter((value): value is string => Boolean(value));
    const bodyExtraction = await extractGmailBody(normalizedBody, attachmentText);
    const senderEmail = emailFromHeader(message.sender);
    const senderName = senderNameFromHeader(message.sender);
    const customerName = bodyExtraction.contact.name || senderName;
    const customerEmail = bodyExtraction.contact.email || senderEmail;
    const customer = await findConfidentCustomer(auth.supabase, auth.contractor.id, customerName, customerEmail, bodyExtraction.contact.phone);
    const { data: created, error: createError } = await admin.rpc('create_gmail_quote_import', {
      p_contractor_id: auth.contractor.id,
      p_mailbox_connection_id: connection.id,
      p_gmail_message_id: message.id,
      p_gmail_thread_id: message.threadId,
      p_sender: message.sender || senderEmail || 'Onbekende afzender',
      p_subject: message.subject,
      p_received_at: message.receivedAt,
      p_body_hash: bodyHash,
      p_body_text: normalizedBody,
      p_customer_id: customer?.id ?? null,
      p_customer_name: customerName,
      p_customer_address: bodyExtraction.contact.address,
      p_customer_email: customerEmail,
      p_customer_phone: bodyExtraction.contact.phone,
    });
    if (createError || !created?.[0]) {
      // A concurrent click can win the unique message constraint. Surface the
      // existing import instead of making a second draft.
      const existing = await admin.from('gmail_quote_imports').select('id,quote_id').eq('mailbox_connection_id', connection.id).eq('gmail_message_id', message.id).maybeSingle();
      if (existing?.data) return NextResponse.json({ ok: true, alreadyExists: true, importId: existing.data.id, quoteId: existing.data.quote_id });
      throw new Error(createError?.message ?? 'Gmail-import kon niet worden aangemaakt.');
    }
    const createdRow = created[0] as { import_id: string; quote_id: string; already_exists: boolean };
    if (createdRow.already_exists) return NextResponse.json({ ok: true, alreadyExists: true, importId: createdRow.import_id, quoteId: createdRow.quote_id });

    const lineCandidates: NewLineItem[] = bodyExtraction.tasks.map((task, index) => ({
      catalog_item_id: null,
      description: task.description.trim(),
      quantity: task.quantity && task.unit ? task.quantity : null,
      unit: task.quantity && task.unit ? task.unit.trim() : null,
      unit_code: null,
      unit_price_cents: task.priceExplicit && task.unitPriceCents !== null ? task.unitPriceCents : null,
      vat_rate: null,
      line_type: task.classification === 'material' ? 'materials' : 'labor',
      classification: task.classification ?? 'labor_service',
      line_kind: task.quantity && task.unit ? 'detailed' : 'simple',
      price_source: task.priceExplicit && task.unitPriceCents !== null ? 'explicit' : 'unknown',
      sort_order: index,
    }));
    const attachmentLines: NewLineItem[] = [];
    let failedAttachments = 0;
    for (const attachment of message.attachments) {
      const path = `${auth.contractor.id}/${createdRow.quote_id}/${crypto.randomUUID()}-${safeFilename(attachment.filename)}`;
      const sha256 = createHash('sha256').update(attachment.bytes).digest('hex');
      const { error: uploadError } = await admin.storage.from('quote-attachments').upload(path, attachment.bytes, { contentType: attachment.mimeType, upsert: false });
      if (uploadError) { failedAttachments += 1; continue; }
      let processingStatus: QuoteAttachment['processing_status'] = 'processed';
      let processingError: string | null = null;
      try {
        if (attachment.mimeType === 'application/pdf' || attachment.filename.toLowerCase().endsWith('.pdf')) {
          if (!process.env.ANTHROPIC_API_KEY) {
            processingStatus = 'unsupported';
            processingError = 'Niet automatisch verwerkt';
          } else {
            attachmentLines.push(...await extractPdfLines(attachment.bytes, attachment.filename));
          }
        } else if (attachment.mimeType.startsWith('image/')) {
          if (!process.env.ANTHROPIC_API_KEY) {
            processingStatus = 'unsupported';
            processingError = 'Niet automatisch verwerkt';
          } else {
            attachmentLines.push(...(await extractImageTasks(attachment.bytes, attachment.mimeType)).map((task, index) => taskToLine(task, index)));
          }
        } else if (!textAttachment(attachment.bytes, attachment.filename, attachment.mimeType)) {
          processingStatus = 'unsupported';
          processingError = 'Niet automatisch verwerkt';
        }
      } catch (error) {
        processingStatus = 'failed';
        processingError = error instanceof Error ? error.message.slice(0, 500) : 'Extractie mislukt';
      }
      const { error: attachmentError } = await admin.from('quote_attachments').insert({
        contractor_id: auth.contractor.id,
        quote_id: createdRow.quote_id,
        gmail_import_id: createdRow.import_id,
        filename: attachment.filename.slice(0, 255),
        mime_type: attachment.mimeType.slice(0, 255),
        byte_size: attachment.bytes.byteLength,
        sha256,
        storage_path: path,
        processing_status: processingStatus,
        processing_error: processingError,
      });
      if (attachmentError) { await admin.storage.from('quote-attachments').remove([path]); failedAttachments += 1; }
    }

    const allLines = dedupeLines([...lineCandidates, ...attachmentLines]);
    const suggested = allLines.length
      ? applyHistoricalSuggestions(allLines, await loadHistoricalPriceCandidates(auth.supabase, auth.contractor.id, createdRow.quote_id))
      : [];
    if (suggested.length) {
      const { error: lineError } = await admin.from('quote_line_items').insert(suggested.map((line, index) => ({ ...line, quote_id: createdRow.quote_id, sort_order: index })));
      if (lineError) console.error('[gmail:import] line save failed', lineError.message);
    }
    revalidatePath('/offertes');
    revalidatePath(`/offertes/${createdRow.quote_id}`);
    return NextResponse.json({ ok: true, alreadyExists: false, importId: createdRow.import_id, quoteId: createdRow.quote_id, attachmentCount: message.attachments.length - failedAttachments, lineCount: suggested.length, partial: failedAttachments > 0 });
  } catch (error) {
    if (error instanceof MailboxError) {
      const status = error.code === 'gmail_read_not_connected' ? 409 : error.code === 'not_connected' ? 503 : 502;
      return NextResponse.json({ error: error.message, code: error.code, reconnect: error.code === 'gmail_read_not_connected' }, { status });
    }
    console.error('[gmail:import] failed', error);
    return NextResponse.json({ error: 'Het Gmail-bericht kon niet als offerte worden geïmporteerd.' }, { status: 502 });
  }
}

async function findConfidentCustomer(supabase: Awaited<ReturnType<typeof requireContractor>>['supabase'], contractorId: string, name: string | null, email: string | null, phone: string | null): Promise<Customer | null> {
  const cleanName = name?.trim();
  if (!cleanName) return null;
  const normalized = normalizeCustomerName(cleanName);
  const { data: matches } = await supabase.from('customers').select('*').eq('contractor_id', contractorId).eq('normalized_name', normalized).limit(2);
  const existing = (matches?.[0] ?? null) as Customer | null;
  if (existing) {
    const emailMatch = Boolean(email && existing.email && email.toLowerCase() === existing.email.toLowerCase());
    const phoneMatch = Boolean(phone && existing.phone && normalizePhone(phone) === normalizePhone(existing.phone));
    return emailMatch || phoneMatch ? existing : null;
  }
  const { data: created } = await supabase.from('customers').insert({ contractor_id: contractorId, name: cleanName, normalized_name: normalized, email, phone }).select('*').single();
  return created as Customer | null;
}

function taskToLine(task: { description: string; quantity: number | null; unit: string | null; unitPriceCents?: number | null; priceExplicit?: boolean; classification?: 'material' | 'labor_service' }, index: number): NewLineItem {
  return {
    catalog_item_id: null, description: task.description.trim(), quantity: task.quantity && task.unit ? task.quantity : null,
    unit: task.quantity && task.unit ? task.unit.trim() : null, unit_code: null,
    unit_price_cents: task.priceExplicit && task.unitPriceCents !== null ? task.unitPriceCents ?? null : null,
    vat_rate: null, line_type: task.classification === 'material' ? 'materials' : 'labor', classification: task.classification ?? 'labor_service',
    line_kind: task.quantity && task.unit ? 'detailed' : 'simple', price_source: task.priceExplicit && task.unitPriceCents !== null ? 'explicit' : 'unknown', sort_order: index,
  };
}

function dedupeLines(lines: NewLineItem[]): NewLineItem[] {
  const seen = new Set<string>();
  return lines.filter((line) => {
    const key = line.description.normalize('NFD').replace(/[̀-ͯ]/gu, '').toLocaleLowerCase('nl-BE').replace(/\s+/gu, ' ').trim();
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function normalizePhone(value: string): string { return value.replace(/\D/gu, '').replace(/^32/u, '0'); }
function safeFilename(value: string): string { return value.replace(/[^a-zA-Z0-9._-]/gu, '_').slice(0, 180) || 'bijlage'; }
