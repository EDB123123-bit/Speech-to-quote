import type { Metadata } from 'next';
import Link from 'next/link';
import { Figtree } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import Icon from '@/components/ui/Icon';
import ExplainerVideo from '@/components/marketing/ExplainerVideo';
import PilotForm from '@/components/marketing/PilotForm';
import WhatsAppIcon from '@/components/marketing/WhatsAppIcon';
import {
  ClarificationFragment,
  CustomerQuoteFragment,
  FinalizeGateFragment,
  HeroStage,
  RecordFragment,
  SuggestedPriceFragment,
  UnpricedLineFragment,
} from '@/components/marketing/ProductFragments';
import { EXPLAINER, PILOT_PHONE_DISPLAY, SITE_URL, WHATSAPP_URL } from '@/components/marketing/site';
import './landing.css';

// Signed-in contractors never reach this page: the proxy sends them to /offertes.

const figtree = Figtree({ subsets: ['latin'], variable: '--font-figtree', display: 'swap' });

const title = 'Werkoffertes | Spreek je offerte in. Pilot voor dakwerkers';
const description =
  'Spreek de klus in op je telefoon en krijg een offerte met lijnen, aantallen en btw. We zoeken vijf dakwerkers en dakdekkers voor een gratis pilot.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'nl_BE',
    url: '/',
    siteName: 'Werkoffertes',
    title: 'Spreek je offerte in. Verstuurd voor je thuis bent.',
    description,
    images: [{ url: '/marketing/og.png', width: 1200, height: 630, alt: 'Werkoffertes: een ingesproken klus wordt een offerte met lijnen en btw.' }],
  },
  twitter: { card: 'summary_large_image', title, description, images: ['/marketing/og.png'] },
};

const STEPS = [
  {
    verb: 'Inspreken',
    body: 'Tik op de knop en vertel wat er moet gebeuren, zoals je het aan een collega zou uitleggen. Werken, aantallen, materialen en de prijzen die je al kent.',
    fragment: <RecordFragment />,
  },
  {
    verb: 'Nakijken',
    body: 'Een halve minuut later staan de offertelijnen klaar. Ontbreekt er iets, dan stelt Werkoffertes je een vraag. Die hoor je hardop en je antwoordt met je stem.',
    fragment: <ClarificationFragment />,
  },
  {
    verb: 'Versturen',
    body: 'Werk de offerte af en je hebt een pdf met je eigen bedrijfsgegevens. Mail ze vanuit je eigen Gmail of Outlook. Je klant aanvaardt online, zonder account.',
    fragment: <CustomerQuoteFragment />,
  },
];

const FAQ = [
  {
    q: 'Verstaat het hoe ik praat?',
    a: 'Spreek zoals je tegen een collega praat, met je eigen woorden en vaktermen. Je ziet altijd wat Werkoffertes gehoord heeft en je past aan wat niet klopt.',
  },
  {
    q: 'Moet ik eerst een prijslijst invoeren?',
    a: 'Nee. Je zegt de prijs erbij of je vult ze achteraf in. Prijzen die je in eerdere offertes gebruikte, worden als voorstel ingevuld.',
  },
  {
    q: 'Wat krijgt mijn klant te zien?',
    a: 'Een verzorgde pdf met jouw bedrijfsgegevens en een link om de offerte online te bekijken en te aanvaarden. Je klant hoeft daarvoor geen account te maken.',
  },
  {
    q: 'Heb ik een aparte app nodig?',
    a: 'Nee. Werkoffertes werkt in de browser van je telefoon, tablet of computer. Je hoeft niets te installeren.',
  },
  {
    q: 'Werkt het ook in Nederland?',
    a: 'Alles is in het Nederlands. De btw staat vandaag op de Belgische tarieven van 6% en 21%. Werk je in Nederland, kies dat dan in je aanmelding: dat zetten we tijdens de pilot samen goed.',
  },
  {
    q: 'Wat kost de pilot?',
    a: 'Niets. Tijdens de pilot gebruik je Werkoffertes gratis. In ruil vragen we je eerlijke feedback. Daarna beslis je zelf of je verder wil.',
  },
];

export default function HomePage() {
  return (
    <div className={`${figtree.variable} lp-root`}>
      <a href="#inhoud" className="lp-skip">Naar de inhoud</a>

      <header className="lp-nav">
        <div className="lp-wrap lp-nav-inner">
          <Link href="/" className="brand-mark" aria-label="Werkoffertes, naar het begin">
            <span className="brand-icon"><Icon name="microphone" size={18} /></span>
            <span>Werkoffertes</span>
          </Link>
          <nav className="lp-nav-links" aria-label="Pagina">
            <a href="#hoe-het-werkt">Hoe het werkt</a>
            <a href="#vragen">Vragen</a>
            <Link href="/login">Inloggen</Link>
          </nav>
          <a href="#pilot" className="btn btn-primary lp-nav-cta">Word pilotklant</a>
        </div>
      </header>

      <main id="inhoud">
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-wrap">
            <div className="lp-hero-copy">
              <p className="lp-kicker" style={{ '--step': 0 } as React.CSSProperties}>Voor dakwerkers en dakdekkers</p>
              <h1 id="hero-title" style={{ '--step': 1 } as React.CSSProperties}>
                <span>Spreek je offerte in.</span> <span>Verstuurd voor je thuis bent.</span>
              </h1>
              <div className="lp-hero-row" style={{ '--step': 2 } as React.CSSProperties}>
                <p className="lp-lead">
                  Werkoffertes maakt van wat je inspreekt een offerte met lijnen, aantallen en btw. Jij kijkt na en verstuurt.
                </p>
                <div className="lp-cta-row">
                  <a href="#pilot" className="btn btn-primary lp-cta">Word pilotklant</a>
                  <a href={WHATSAPP_URL} className="lp-text-link" target="_blank" rel="noopener noreferrer">
                    <WhatsAppIcon /> WhatsApp Edouard
                  </a>
                </div>
              </div>
            </div>
            <HeroStage />
          </div>
        </section>

        <section className="lp-video-band" aria-labelledby="video-title">
          <div className="lp-wrap">
            <h2 id="video-title" className="lp-h2">Van inspreken tot akkoord van je klant.</h2>
            <ExplainerVideo
              wide={EXPLAINER.wide}
              tall={EXPLAINER.tall}
              label="Uitlegvideo zonder geluid: een dakwerker spreekt een klus in, kijkt de offerte na, verstuurt ze en de klant aanvaardt ze online."
              lengthLabel="54 seconden, met ondertitels"
            />
          </div>
        </section>

        <section id="hoe-het-werkt" className="lp-section" aria-labelledby="steps-title">
          <div className="lp-wrap">
            <h2 id="steps-title" className="lp-h2">Zo werkt het, gewoon op je telefoon.</h2>
            <ol className="lp-steps">
              {STEPS.map((item) => (
                <li key={item.verb} className="lp-step">
                  <div className="lp-step-copy">
                    <h3>{item.verb}</h3>
                    <p>{item.body}</p>
                  </div>
                  {item.fragment}
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lp-section lp-trust" aria-labelledby="trust-title">
          <div className="lp-wrap">
            <h2 id="trust-title" className="lp-h2">Werkoffertes verzint geen prijzen.</h2>
            <p className="lp-section-lead">
              Jij bent de vakman. Werkoffertes schrijft op wat jij zegt en maakt duidelijk wat nog ontbreekt.
            </p>
            <div className="lp-bento">
              <div className="lp-cell lp-cell-main">
                <h3>Niet gezegd, dan niet ingevuld</h3>
                <p>Noem je geen prijs, dan blijft de lijn open. Ze telt pas mee in het totaal als jij een prijs invult. Bij je klant staat er ‘prijs nog te bepalen’.</p>
                <UnpricedLineFragment />
              </div>
              <div className="lp-cell">
                <h3>Je eigen prijzen als voorstel</h3>
                <p>Gebruikte je een post al in een eerdere offerte, dan stelt Werkoffertes die prijs voor. Jij beslist.</p>
                <SuggestedPriceFragment />
              </div>
              <div className="lp-cell lp-cell-accent">
                <h3>Eerst de vragen, dan afwerken</h3>
                <p>Staat er nog een vraag open, dan kun je de offerte niet afwerken.</p>
                <FinalizeGateFragment />
              </div>
            </div>
          </div>
        </section>

        <section id="vragen" className="lp-section lp-faq" aria-labelledby="faq-title">
          <div className="lp-wrap lp-faq-grid">
            <h2 id="faq-title" className="lp-h2">Veelgestelde vragen</h2>
            <div className="lp-faq-list">
              {FAQ.map((item) => (
                <details key={item.q} className="lp-faq-item">
                  <summary>
                    <span>{item.q}</span>
                    <Icon name="plus" size={22} className="lp-faq-icon" />
                  </summary>
                  <p>{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section id="pilot" className="lp-pilot" aria-labelledby="pilot-title">
          <div className="lp-wrap lp-pilot-grid">
            <div className="lp-pilot-copy">
              <h2 id="pilot-title" className="lp-h2">Word een van de vijf pilotklanten.</h2>
              <p className="lp-section-lead">
                We zoeken vijf dakwerkers in Vlaanderen en Nederland die Werkoffertes gebruiken voor hun echte offertes.
              </p>
              <ul className="lp-perks">
                <li><Icon name="check" size={20} /> Tijdens de pilot gebruik je Werkoffertes gratis.</li>
                <li><Icon name="check" size={20} /> We zetten je account samen op, met je bedrijfsgegevens en je mailbox.</li>
                <li><Icon name="check" size={20} /> Je hebt een rechtstreekse lijn met Edouard, ook via WhatsApp.</li>
              </ul>
              <figure className="lp-founder">
                <blockquote>
                  <p>
                    “Ik bouw Werkoffertes omdat een offerte maken niet langer mag duren dan de klus uitleggen. De eerste vijf dakwerkers help ik zelf op weg. Ik bel je persoonlijk terug.”
                  </p>
                </blockquote>
                <figcaption>
                  <span className="lp-founder-mark" aria-hidden="true">E</span>
                  <span><strong>Edouard</strong> Oprichter van Werkoffertes</span>
                </figcaption>
              </figure>
              <a href={WHATSAPP_URL} className="btn btn-outline lp-whatsapp" target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon /> WhatsApp Edouard
              </a>
            </div>
            <PilotForm />
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <div>
            <p className="brand-mark"><span className="brand-icon"><Icon name="microphone" size={18} /></span> Werkoffertes</p>
            <p className="lp-footer-line">Spraakgestuurde offertes voor dakwerkers.</p>
          </div>
          <nav className="lp-footer-links" aria-label="Voettekst">
            <a href="#hoe-het-werkt">Hoe het werkt</a>
            <a href="#vragen">Veelgestelde vragen</a>
            <Link href="/login">Inloggen</Link>
          </nav>
          <div className="lp-footer-contact">
            <p>Vragen? Bel of WhatsApp</p>
            <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">{PILOT_PHONE_DISPLAY}</a>
          </div>
        </div>
      </footer>

      <Analytics />
    </div>
  );
}
