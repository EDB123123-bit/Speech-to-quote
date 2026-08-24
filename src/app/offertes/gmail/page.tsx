import Link from 'next/link';
import Icon from '@/components/ui/Icon';
import GmailImportPicker from '@/components/GmailImportPicker';

export default function GmailImportPage() {
  return <main className="page-shell page-narrow">
    <Link href="/offertes/nieuw" className="back-link"><Icon name="arrow-left" /> Terug naar nieuwe offerte</Link>
    <div className="record-intro">
      <p className="eyebrow">Gmail</p>
      <h1 className="page-title">Importeer een aanvraag.</h1>
      <p className="page-subtitle">Kies één bericht. Ik maak er een bewerkbaar offerteconcept van met de bijlagen erbij.</p>
    </div>
    <GmailImportPicker />
  </main>;
}
