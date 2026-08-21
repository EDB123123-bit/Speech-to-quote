'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as tus from 'tus-js-client';
import { createBrowserSupabase } from '@/lib/supabase/client';
import {
  MAX_BATCH_BYTES,
  MAX_BATCH_DOCUMENTS,
  MAX_DOCUMENT_BYTES,
  quoteImportProcessingMode,
} from '@/lib/quote-imports/constants';
import { createQuoteImportBatch, discardUnregisteredUpload, registerUploadedQuote } from './actions';

type UploadRow = { id: string; name: string; progress: number; status: 'wachten' | 'uploaden' | 'klaar' | 'fout'; error?: string };

export default function QuoteImportUploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [requestedCount, setRequestedCount] = useState('');
  const [rows, setRows] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start(files: FileList | null) {
    if (!files?.length || busy) return;
    const selected = [...files];
    const count = Number(requestedCount);
    const invalid = validateFiles(selected, count);
    if (invalid) { setError(invalid); return; }
    setBusy(true);
    setError('');
    setRows(selected.map((file, index) => ({
      id: `${index}-${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      progress: 0,
      status: 'wachten',
    })));

    try {
      const batch = await createQuoteImportBatch(count);
      let failed = false;
      for (let index = 0; index < selected.length; index += 1) {
        const file = selected[index];
        setRows((current) => patchRow(current, index, { status: 'uploaden' }));
        try {
          const sha256 = await sha256Hex(file);
          const objectName = `${batch.contractor_id}/${batch.id}/${sha256}-${crypto.randomUUID()}.pdf`;
          await uploadResumable(file, objectName, (progress) => {
            setRows((current) => patchRow(current, index, { progress }));
          });
          try {
            await registerUploadedQuote({ batchId: batch.id, originalFilename: file.name, storagePath: objectName, sha256, fileSizeBytes: file.size });
          } catch (registrationError) {
            await discardUnregisteredUpload({ batchId: batch.id, storagePath: objectName });
            throw registrationError;
          }
          setRows((current) => patchRow(current, index, { status: 'klaar', progress: 100 }));
        } catch (uploadError) {
          failed = true;
          setRows((current) => patchRow(current, index, {
            status: 'fout', error: uploadError instanceof Error ? uploadError.message : 'Upload mislukt.',
          }));
        }
      }
      if (failed) {
        setError('Minstens één upload is mislukt. Kies alle pdf’s opnieuw om een nieuwe import te starten.');
        setBusy(false);
        return;
      }
      router.push(`/offertes/importeren/${batch.id}`);
    } catch {
      setError('De import kon niet worden gestart. Probeer opnieuw.');
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <label className="label flex flex-col gap-2" htmlFor="quote-import-count">
        Hoeveel offertes wil je importeren?
        <input
          id="quote-import-count"
          className="field max-w-48 text-ink"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_BATCH_DOCUMENTS}
          step={1}
          value={requestedCount}
          disabled={busy}
          placeholder="Bijvoorbeeld 12"
          onChange={(event) => {
            setRequestedCount(event.target.value);
            setRows([]);
            setError('');
          }}
        />
      </label>
      {validRequestedCount(requestedCount) && <div className={`mt-4 rounded-xl border p-4 ${quoteImportProcessingMode(Number(requestedCount)) === 'provider_batch' ? 'border-amber-300 bg-amber-50' : 'border-line bg-paper'}`}>
        <strong>{quoteImportProcessingMode(Number(requestedCount)) === 'provider_batch' ? 'Batchimport' : 'Snelle import'}</strong>
        <p className="mt-1 text-sm text-muted">
          {quoteImportProcessingMode(Number(requestedCount)) === 'provider_batch'
            ? 'Meer dan 20 offertes worden goedkoper asynchroon verwerkt. Dit kan tot 24 uur duren; na de upload kun je later terugkomen.'
            : 'Tot en met 20 offertes worden direct verwerkt met een snel model en alleen bij twijfel opnieuw gecontroleerd met het nauwkeurigere model.'}
        </p>
      </div>}
      <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple className="sr-only" onChange={(event) => void start(event.target.files)} />
      <button type="button" className="btn btn-primary mt-5 w-full" disabled={busy || !validRequestedCount(requestedCount)} onClick={() => {
        if (!inputRef.current) return;
        inputRef.current.value = '';
        inputRef.current.click();
      }}>
        {busy ? 'Pdf’s uploaden…' : validRequestedCount(requestedCount) ? `Kies ${requestedCount} PDF-offerte${Number(requestedCount) === 1 ? '' : 's'}` : 'Vul eerst het aantal in'}
      </button>
      <p className="mt-3 text-sm text-muted">Maximaal 25 bestanden, 20 MB en 20 pagina&apos;s per pdf, 200 MB per batch.</p>
      {error && <p role="alert" className="alert alert-critical mt-4">{error}</p>}
      {rows.length > 0 && <div className="mt-5 flex flex-col gap-3">
        {rows.map((row) => <div key={row.id} className="rounded-xl border border-line p-3">
          <div className="flex justify-between gap-3 text-sm"><strong className="truncate">{row.name}</strong><span>{row.status}</span></div>
          <progress className="mt-2 w-full" max={100} value={row.progress} />
          {row.error && <p className="mt-1 text-sm text-red-700">{row.error}</p>}
        </div>)}
      </div>}
    </section>
  );
}

function validRequestedCount(value: string): boolean {
  const count = Number(value);
  return Number.isInteger(count) && count >= 1 && count <= MAX_BATCH_DOCUMENTS;
}

function validateFiles(files: File[], requestedCount: number): string | null {
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > MAX_BATCH_DOCUMENTS) return `Kies eerst een aantal tussen 1 en ${MAX_BATCH_DOCUMENTS}.`;
  if (files.length !== requestedCount) return `Selecteer precies ${requestedCount} pdf${requestedCount === 1 ? '' : '’s'}.`;
  if (files.length > MAX_BATCH_DOCUMENTS) return `Kies maximaal ${MAX_BATCH_DOCUMENTS} pdf’s.`;
  if (files.some((file) => file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf'))) return 'Alleen pdf-bestanden zijn toegestaan.';
  if (files.some((file) => file.size <= 0 || file.size > MAX_DOCUMENT_BYTES)) return 'Elke pdf moet kleiner zijn dan 20 MB.';
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BATCH_BYTES) return 'De batch mag maximaal 200 MB zijn.';
  return null;
}

function patchRow(rows: UploadRow[], index: number, changes: Partial<UploadRow>) {
  return rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...changes } : row);
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function uploadResumable(file: File, objectName: string, onProgress: (progress: number) => void) {
  const supabase = createBrowserSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Je sessie is verlopen. Meld opnieuw aan.');
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const endpoint = `${baseUrl.replace('.supabase.co', '.storage.supabase.co')}/storage/v1/upload/resumable`;
  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint,
      retryDelays: [0, 1000, 3000, 5000],
      chunkSize: 6 * 1024 * 1024,
      uploadDataDuringCreation: true,
      fingerprint: async () => `quote-import-${objectName}`,
      headers: { authorization: `Bearer ${session.access_token}`, 'x-upsert': 'false' },
      metadata: { bucketName: 'quote-imports', objectName, contentType: 'application/pdf', cacheControl: '3600' },
      removeFingerprintOnSuccess: true,
      onProgress: (sent, total) => onProgress(Math.round((sent / total) * 100)),
      onError: (uploadError) => reject(uploadError),
      onSuccess: () => resolve(),
    });
    void upload.findPreviousUploads().then((previous) => {
      if (previous[0]) upload.resumeFromPreviousUpload(previous[0]);
      upload.start();
    }).catch(reject);
  });
}
