/** All timings in frames at 30 fps. The whole story is 54 seconds. */
export const FPS = 30;
export const TOTAL = 1620;

export const T = {
  hookEnd: 150,
  // Inspreken
  recordStart: 150,
  tap: 212,
  recordingStart: 222,
  wordsStart: 240,
  wordsEnd: 415,
  recordingEnd: 425,
  // Nakijken
  processingStart: 450,
  processingDone: 506,
  linesStart: 520,
  focusGutter: 640,
  typePrice: 732,
  gutterPriced: 780,
  questionStart: 815,
  playQuestion: 848,
  answerStart: 902,
  answerWords: 925,
  answerEnd: 975,
  questionResolved: 985,
  linesAgain: 1000,
  // Versturen
  finalizeStart: 1050,
  finalizePress: 1086,
  ready: 1096,
  sendStart: 1140,
  sendPress: 1212,
  sent: 1222,
  // Akkoord
  customerStart: 1260,
  acceptPress: 1332,
  accepted: 1342,
  ctaStart: 1410,
} as const;

export const CAPTIONS: { from: number; to: number; text: string }[] = [
  { from: 0, to: 75, text: 'Na een lange dag op het dak nog offertes typen?' },
  { from: 75, to: 150, text: 'Met Werkoffertes spreek je ze gewoon in.' },
  { from: 150, to: 240, text: 'Tik op de knop en vertel wat er moet gebeuren.' },
  { from: 240, to: 450, text: 'Zoals je het aan een collega zou uitleggen.' },
  { from: 450, to: 540, text: 'Een halve minuut later staat je offerte klaar.' },
  { from: 540, to: 630, text: 'Met lijnen, aantallen en btw.' },
  { from: 630, to: 720, text: 'Geen prijs gezegd? Dan verzint Werkoffertes er geen.' },
  { from: 720, to: 810, text: 'Die lijn blijft open tot jij de prijs invult.' },
  { from: 810, to: 900, text: 'Ontbreekt er iets? Dan krijg je een vraag.' },
  { from: 900, to: 1050, text: 'Je antwoordt gewoon met je stem.' },
  { from: 1050, to: 1140, text: 'Klopt alles? Werk de offerte af.' },
  { from: 1140, to: 1260, text: 'Mail de pdf vanuit je eigen Gmail of Outlook.' },
  { from: 1260, to: 1410, text: 'Je klant keurt de offerte online goed. Zonder account.' },
];

export const STEPS = [
  { label: 'Inspreken', from: 150, to: 450 },
  { label: 'Nakijken', from: 450, to: 1050 },
  { label: 'Versturen', from: 1050, to: 1260 },
  { label: 'Akkoord', from: 1260, to: 1410 },
] as const;

export const TRANSCRIPT: { text: string; highlight?: boolean }[] = [
  { text: '45 vierkante meter pannen vernieuwen', highlight: true },
  { text: ', aan 58 euro per vierkante meter. ' },
  { text: '12 meter dakgoot vervangen in zink', highlight: true },
  { text: '. ' },
  { text: 'Container erbij', highlight: true },
  { text: ', 350 euro. Het huis is ouder dan tien jaar.' },
];

export const ANSWER = 'Ja, twee stuks, 145 euro per stuk.';
