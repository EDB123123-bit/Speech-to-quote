'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { QuoteImportBatch, QuoteImportDocument, QuoteImportIdentityMode } from '@/lib/supabase/types';
import type { ReviewedQuotePayload } from '@/lib/quote-imports/schema';
import { validateReviewedTotals } from '@/lib/quote-imports/validation';
import {
  groupQuoteImportIssues,
  inferredFieldLabelsByLine,
  type QuoteImportIssue,
} from '@/lib/quote-imports/issues';
import { formatLineNumbersNl } from '@/lib/quote-imports/approval-errors';
import { formatEuros } from '@/lib/money/totals';
import { approveQuoteImport, reviewProfileSuggestion } from '../actions';

export default function ImportBatchDashboard({ batch, documents }: { batch: QuoteImportBatch; documents: QuoteImportDocument[] }) {
  const router = useRouter();
  const [expiredIds, setExpiredIds] = useState<string[]>([]);
  const processable = useMemo(() => batch.processing_mode === 'interactive'
    ? documents.filter((document) => document.status === 'uploaded'
      || (document.status === 'processing' && expiredIds.includes(document.id))).slice(0, 2)
    : [], [batch.processing_mode, documents, expiredIds]);
  useEffect(() => {
    if (batch.processing_mode !== 'interactive') return;
    const processing = documents.filter((document) => document.status === 'processing' && document.locked_until);
    if (!processing.length) return;
    const update = () => setExpiredIds(processing.filter((document) => new Date(document.locked_until!).getTime() <= Date.now()).map((document) => document.id));
    const timer = window.setTimeout(update, Math.max(0, Math.min(...processing.map((document) => new Date(document.locked_until!).getTime() - Date.now()))) + 50);
    return () => window.clearTimeout(timer);
  }, [batch.processing_mode, documents]);
  useEffect(() => {
    if (!processable.length) return;
    let cancelled = false;
    void Promise.allSettled(processable.map((document) => fetch(`/api/quote-imports/${document.id}/process`, { method: 'POST' }))).then(() => {
      if (!cancelled) router.refresh();
    });
    return () => { cancelled = true; };
  }, [processable, router]);
  useEffect(() => {
    if (batch.processing_mode !== 'interactive') return;
    if (!documents.some((document) => document.status === 'processing')) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [batch.processing_mode, documents, router]);
  useEffect(() => {
    if (batch.processing_mode !== 'provider_batch'
      || !documents.some((document) => document.status === 'uploaded' || document.status === 'processing')) return;
    let cancelled = false;
    let timer: number | undefined;
    const submitPending = documents.some((document) => document.status === 'uploaded');
    const tick = async () => {
      try {
        await fetch(`/api/quote-imports/batches/${batch.id}/process`, { method: 'POST' });
      } catch {
        // A later poll retries transient network failures.
      } finally {
        if (!cancelled) {
          router.refresh();
          timer = window.setTimeout(tick, submitPending ? 2500 : 30000);
        }
      }
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [batch.id, batch.processing_mode, documents, router]);

  const imported = documents.filter((document) => document.status === 'imported').length;
  const review = documents.filter((document) => document.status === 'ready_for_review').length;
  const problems = documents.filter((document) => ['unsupported', 'failed', 'duplicate'].includes(document.status)).length;
  return <div className="flex flex-col gap-5">
    {batch.processing_mode === 'provider_batch' && <section className="alert alert-warning flex-col items-start">
      <strong>Batchimport wordt asynchroon verwerkt</strong>
      <p>Dit kan tot 24 uur duren. Gestarte documenten blijven bij de provider lopen; nog niet gestarte documenten en statuscontroles hervatten automatisch wanneer je terugkomt.</p>
    </section>}
    <section className="grid grid-cols-3 gap-3">
      <Count label="Geïmporteerd" value={imported} /><Count label="Na te kijken" value={review} /><Count label="Aandacht" value={problems} />
    </section>
    {batch.profile_suggestion && batch.profile_suggestion_status === 'pending' && <ProfileSuggestion batch={batch} />}
    {documents.map((document) => <DocumentCard key={document.id} batch={batch} document={document} />)}
  </div>;
}

function ProfileSuggestion({ batch }: { batch: QuoteImportBatch }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const suggestion = batch.profile_suggestion!;
  return <section className="card"><h2 className="text-lg font-extrabold">Mogelijke bedrijfsgegevens gevonden</h2><p className="mt-1 text-sm text-muted">{String(suggestion.companyName ?? 'Onbekend')} · gebaseerd op {String(suggestion.observationCount ?? 1)} document(en). Controleer dit voor je profiel wordt aangepast.</p><pre className="mt-3 overflow-auto rounded-xl bg-paper p-3 text-xs">{JSON.stringify(suggestion, null, 2)}</pre><div className="mt-3 flex gap-2"><button className="btn btn-primary" disabled={pending} onClick={() => startTransition(async () => { await reviewProfileSuggestion({ batchId: batch.id, accept: true, profile: suggestion }); router.refresh(); })}>Gecontroleerd en toepassen</button><button className="btn btn-outline" disabled={pending} onClick={() => startTransition(async () => { await reviewProfileSuggestion({ batchId: batch.id, accept: false, profile: null }); router.refresh(); })}>Niet toepassen</button></div></section>;
}

function Count({ label, value }: { label: string; value: number }) {
  return <div className="card text-center"><strong className="text-2xl">{value}</strong><p className="text-sm text-muted">{label}</p></div>;
}

function DocumentCard({ batch, document }: { batch: QuoteImportBatch; document: QuoteImportDocument }) {
  const router = useRouter();
  const [payload, setPayload] = useState<ReviewedQuotePayload | null>(() => document.reviewed_payload as ReviewedQuotePayload | null);
  const [identityMode, setIdentityMode] = useState<QuoteImportIdentityMode>('new_identity');
  const [acknowledged, setAcknowledged] = useState(false);
  const [roundingReason, setRoundingReason] = useState('');
  const [message, setMessage] = useState('');
  const [wideSource, setWideSource] = useState(false);
  const [pending, startTransition] = useTransition();
  const issues = (document.validation_result?.issues ?? []) as QuoteImportIssue[];
  const reviewedTotals = payload ? validateReviewedTotals(payload) : null;
  const grouped = groupQuoteImportIssues(issues, payload?.lines.length ?? 0);
  const inferredByLine = inferredFieldLabelsByLine(payload?.inferredPaths ?? [], payload?.lines.length ?? 0);
  // The approval schema requires a unit on every line, so an empty one can never
  // import. Block it here instead of letting the server reject the whole payload.
  const linesMissingUnit = (payload?.lines ?? [])
    .map((line, index) => (line.unit.trim() ? null : index + 1))
    .filter((lineNumber): lineNumber is number => lineNumber !== null);

  if (document.status !== 'ready_for_review' || !payload) {
    return <article className="card flex items-center justify-between gap-4"><div><strong>{document.original_filename}</strong><p className="text-sm text-muted">{statusLabel(document.status, batch.processing_mode === 'provider_batch')}</p>{document.provider_batch_status === 'in_progress' && <p className="mt-1 text-xs text-muted">Asynchrone verwerking gestart; uiterlijk na 24 uur volgt een resultaat.</p>}{document.error_message && <p className="mt-1 text-sm text-red-700">{document.error_message}</p>}</div>{document.status === 'failed' && <button className="btn btn-outline" onClick={() => void fetch(`/api/quote-imports/${document.id}/process`, { method: 'POST' }).then(() => router.refresh())}>Opnieuw</button>}{document.quote_id && <Link className="btn btn-outline" href={`/offertes/${document.quote_id}`}>Open concept</Link>}</article>;
  }

  function approve() {
    setMessage('');
    startTransition(async () => {
      try {
        const result = await approveQuoteImport({ documentId: document.id, batchId: batch.id, payload, identityMode, warningsAcknowledged: acknowledged, roundingOverrideReason: roundingReason || null });
        if (!result.ok) {
          setMessage(result.error);
          return;
        }
        router.push(`/offertes/${result.quote.id}`);
      } catch {
        setMessage('Importeren mislukt. Probeer opnieuw.');
      }
    });
  }

  return <article className="card">
    <div className="mb-4"><strong>{document.original_filename}</strong><p className="text-sm text-muted">Pagina&apos;s: {document.page_count ?? '—'}</p></div>
    <div className={`grid gap-5 ${wideSource ? '' : 'lg:grid-cols-2'}`}>
      <div className={wideSource ? '' : 'lg:sticky lg:top-4 lg:self-start'}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-quiet" aria-pressed={wideSource} onClick={() => setWideSource((current) => !current)}>
            {wideSource ? 'Naast het formulier tonen' : 'Bron groter tonen'}
          </button>
          <a className="btn btn-quiet" href={`/api/quote-imports/${document.id}/source`} target="_blank" rel="noreferrer">
            Openen in nieuw tabblad
          </a>
        </div>
        <iframe title={`Bronbestand ${document.original_filename}`} src={`/api/quote-imports/${document.id}/source`} className={`w-full rounded-xl border border-line ${wideSource ? 'min-h-[85vh]' : 'min-h-[75vh]'}`} />
      </div>
      <div className="flex flex-col gap-4">
        {grouped.document.length > 0 && <div className="alert alert-warning flex-col items-start">{grouped.document.map((issue) => <p key={`${issue.code}-${issue.path ?? ''}-${issue.messageNl}`}>{issue.messageNl}</p>)}</div>}
        {grouped.byLine.size > 0 && <p className="text-sm text-muted">
          {grouped.byLine.size === 1 ? '1 offertelijn vraagt aandacht' : `${grouped.byLine.size} offertelijnen vragen aandacht`}. De opmerkingen staan bij de betrokken lijn.
        </p>}
        <fieldset className="grid grid-cols-2 gap-3"><legend className="label col-span-full">Klant</legend>
          <TextField label="Naam" value={payload.customer.name ?? ''} onChange={(value) => setPayload({ ...payload, customer: { ...payload.customer, name: value || null } })} />
          <TextField label="E-mail" value={payload.customer.email ?? ''} onChange={(value) => setPayload({ ...payload, customer: { ...payload.customer, email: value || null } })} />
          <div className="col-span-full"><TextField label="Adres" value={payload.customer.address ?? ''} onChange={(value) => setPayload({ ...payload, customer: { ...payload.customer, address: value || null } })} /></div>
        </fieldset>
        <fieldset className="grid grid-cols-2 gap-3"><legend className="label col-span-full">Bronidentiteit</legend>
          <TextField label="Offertenummer" value={payload.quote.number ?? ''} onChange={(value) => setPayload({ ...payload, quote: { ...payload.quote, number: value || null } })} />
          <TextField label="Referentie" value={payload.quote.orderReference ?? ''} onChange={(value) => setPayload({ ...payload, quote: { ...payload.quote, orderReference: value || null } })} />
          <TextField label="Datum" type="date" value={payload.quote.issueDate ?? ''} onChange={(value) => setPayload({ ...payload, quote: { ...payload.quote, issueDate: value || null } })} />
          <TextField label="Geldig tot" type="date" value={payload.quote.validUntil ?? ''} onChange={(value) => setPayload({ ...payload, quote: { ...payload.quote, validUntil: value || null } })} />
        </fieldset>
        <div className="flex flex-col gap-3"><p className="label">Offertelijnen</p>{payload.lines.map((line, index) => {
          const lineIssues = grouped.byLine.get(index) ?? [];
          const inferredLabels = inferredByLine.get(index) ?? [];
          return <div key={index} className={`rounded-xl border p-3 ${lineIssues.length > 0 ? 'border-amber-300 bg-amber-50' : 'border-line'}`}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <strong className="text-sm">Lijn {index + 1}</strong>
            {lineIssues.length > 0 && <span className="badge badge-warning">{lineIssues.length} {lineIssues.length === 1 ? 'opmerking' : 'opmerkingen'}</span>}
          </div>
          {lineIssues.length > 0 && <ul className="mb-3 flex flex-col gap-1 text-sm">
            {lineIssues.map((issue, issueIndex) => <li key={`${issue.code}-${issue.path ?? issueIndex}`}>
              {issue.fieldLabel && <strong>{issue.fieldLabel}: </strong>}{issue.messageNl}
            </li>)}
          </ul>}
          {inferredLabels.length > 0 && <p className="mb-3 text-xs text-muted">Afgeleide velden: {inferredLabels.join(', ')}</p>}
          {!line.unit.trim() && <p className="mb-3 text-sm font-bold text-critical">Eenheid is verplicht. Vul in wat je factureert, bijvoorbeeld stuk, m² of uur.</p>}
          <div className="grid grid-cols-6 gap-2">
          <div className="col-span-5"><TextField label="Omschrijving" value={line.description} onChange={(value) => setPayload({ ...payload, lines: payload.lines.map((item, i) => i === index ? { ...item, description: value } : item) })} /></div><button type="button" className="text-sm font-bold text-critical" disabled={payload.lines.length === 1} onClick={() => setPayload({ ...payload, lines: payload.lines.filter((_, i) => i !== index) })}>Verwijder</button>
          <div className="col-span-6"><TextField label="Bronnotitie" value={line.notes ?? ''} onChange={(value) => setPayload({ ...payload, lines: payload.lines.map((item, i) => i === index ? { ...item, notes: value || null } : item) })} /></div>
          <TextField label="Aantal" type="number" value={String(line.quantity)} onChange={(value) => setPayload({ ...payload, lines: payload.lines.map((item, i) => i === index ? { ...item, quantity: Number(value) } : item) })} />
          <TextField label="Eenheid" value={line.unit} onChange={(value) => setPayload({ ...payload, lines: payload.lines.map((item, i) => i === index ? { ...item, unit: value } : item) })} />
          <div className="col-span-2"><TextField label="Prijs excl. btw (€)" type="number" value={String(line.unitPriceCents / 100)} onChange={(value) => setPayload({ ...payload, lines: payload.lines.map((item, i) => i === index ? { ...item, unitPriceCents: Math.round(Number(value) * 100) } : item) })} /></div>
          <label className="label col-span-2 flex flex-col gap-1">Btw<select className="field text-ink" value={`${line.vatCategory}:${line.vatRate}`} onChange={(event) => { const [category, rate] = event.target.value.split(':'); setPayload({ ...payload, lines: payload.lines.map((item, i) => i === index ? { ...item, vatCategory: category as 'S' | 'AE', vatRate: Number(rate) as 0 | 0.06 | 0.21 } : item) }); }}><option value="S:0.06">6%</option><option value="S:0.21">21%</option><option value="AE:0">Verlegging</option></select></label>
        </div>
        </div>;
        })}<button type="button" className="btn btn-quiet" onClick={() => setPayload({ ...payload, lines: [...payload.lines, { description: '', notes: null, quantity: 1, unit: '', unitCode: null, unitPriceCents: 0, vatRate: 0.21, vatCategory: 'S', lineType: 'combined' }] })}>Offertelijn toevoegen</button></div>
        <fieldset className="flex flex-col gap-2"><legend className="label">Identiteit van het concept</legend><label><input type="radio" checked={identityMode === 'new_identity'} onChange={() => setIdentityMode('new_identity')} /> Nieuw offertenummer en datum</label><label><input type="radio" checked={identityMode === 'preserve_source'} onChange={() => setIdentityMode('preserve_source')} /> Nummer en datums van de bron behouden</label></fieldset>
        <div className="rounded-xl bg-paper p-3 text-sm"><div className="flex justify-between"><span>Herberekend excl. btw</span><strong>{formatEuros(reviewedTotals!.totals.subtotalCents)}</strong></div><div className="flex justify-between"><span>Herberekende btw</span><strong>{formatEuros(reviewedTotals!.totals.vatTotalCents)}</strong></div><div className="flex justify-between"><span>Herberekend totaal</span><strong>{formatEuros(reviewedTotals!.totals.grandTotalCents)}</strong></div></div>
        {(issues.length > 0 || payload.inferredPaths.length > 0 || reviewedTotals!.mismatches.length > 0) && <label className="flex gap-2 text-sm"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /> Ik heb de waarschuwingen, afgeleide velden en eventuele totaalverschillen gecontroleerd.</label>}
        {reviewedTotals!.mismatches.length > 0 && <TextField label="Reden voor verschil met de brontotalen" value={roundingReason} onChange={setRoundingReason} />}
        {linesMissingUnit.length > 0 && <p role="alert" className="alert alert-critical">
          Vul de eenheid in bij lijn {formatLineNumbersNl(linesMissingUnit)} voor je importeert.
        </p>}
        {message && <p role="alert" className="alert alert-critical">{message}</p>}
        <button className="btn btn-primary" disabled={pending || linesMissingUnit.length > 0 || ((issues.length > 0 || payload.inferredPaths.length > 0 || reviewedTotals!.mismatches.length > 0) && !acknowledged) || (reviewedTotals!.mismatches.length > 0 && !roundingReason.trim())} onClick={approve}>{pending ? 'Importeren…' : 'Als bewerkbaar concept importeren'}</button>
      </div>
    </div>
  </article>;
}

function TextField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label className="label flex flex-col gap-1">{label}<input className="field text-ink" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function statusLabel(status: QuoteImportDocument['status'], providerBatch: boolean) {
  return ({ uploaded: providerBatch ? 'Wacht op batchverwerking' : 'Wacht op verwerking', processing: providerBatch ? 'Wordt asynchroon uitgelezen…' : 'Wordt uitgelezen…', imported: 'Geïmporteerd', duplicate: 'Duplicaat', unsupported: 'Niet ondersteund', failed: 'Verwerking mislukt', importing: 'Wordt geïmporteerd…', ready_for_review: 'Klaar om na te kijken' } as const)[status];
}
