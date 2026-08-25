import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import RecordQuote from './RecordQuote';
import { createManualQuote, createMeerwerkQuote } from '../quote-actions';

export default async function NewQuotePage({ searchParams }: { searchParams: Promise<{ parent?: string | string[] }> }) {
  const params = await searchParams;
  const parentQuoteId = typeof params.parent === 'string' ? params.parent : null;
  const manualAction = parentQuoteId ? createMeerwerkQuote.bind(null, parentQuoteId) : createManualQuote;
  return (
    <main className="page-shell page-narrow">
      <Link href="/offertes" className="back-link"><Icon name="arrow-left" /> Terug naar offertes</Link>
      <div className="record-intro">
        <p className="eyebrow">{parentQuoteId ? 'Nieuwe meerwerkofferte' : 'Nieuwe offerte'}</p>
        <h1 className="page-title">{parentQuoteId ? 'Spreek het meerwerk in.' : 'Vertel wat er moet gebeuren.'}</h1>
        <p className="page-subtitle">
          {parentQuoteId ? 'Noem de extra werken, aantallen en materialen. Spreek zoals je het aan een collega zou uitleggen.' : 'Noem de werken, aantallen en materialen. Spreek zoals je het aan een collega zou uitleggen.'}
        </p>
      </div>
      <RecordQuote parentQuoteId={parentQuoteId} />
      <div className="mt-6 border-t border-border pt-6 text-center">
        <p className="text-sm text-muted">Liever zelf invoeren?</p>
        <form action={manualAction} className="mt-3">
          <button type="submit" className="btn btn-outline w-full">{parentQuoteId ? 'Meerwerk handmatig invoeren' : 'Handmatig een offerte starten'}</button>
        </form>
        {!parentQuoteId && <Link href="/offertes/gmail" className="btn btn-quiet mt-2 w-full">Importeren uit Gmail</Link>}
      </div>
    </main>
  );
}
