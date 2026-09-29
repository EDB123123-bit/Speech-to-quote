/** Public contact details and URLs for the marketing home page. */
export const PILOT_PHONE_DISPLAY = '+32 479 87 08 89';
export const PILOT_PHONE_E164 = '+32479870889';

export const WHATSAPP_URL = `https://wa.me/${PILOT_PHONE_E164.slice(1)}?text=${encodeURIComponent(
  'Hallo Pieter, ik heb interesse in de pilot van Werkoffertes.',
)}`;

export const SITE_URL = (process.env.APP_URL?.trim() || 'https://speech-to-quote-mu.vercel.app').replace(/\/$/, '');

export const EXPLAINER = {
  wide: { src: '/marketing/werkoffertes-uitleg-16x9.mp4', poster: '/marketing/werkoffertes-uitleg-16x9.jpg', width: 1920, height: 1080 },
  tall: { src: '/marketing/werkoffertes-uitleg-9x16.mp4', poster: '/marketing/werkoffertes-uitleg-9x16.jpg', width: 1080, height: 1920 },
} as const;
