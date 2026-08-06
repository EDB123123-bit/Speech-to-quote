# Manual test checklist — v1

Run on a real phone (iOS Safari and Android Chrome), on the deployed HTTPS URL.

## Setup
- [ ] Sign up creates an account and lands on /offertes
- [ ] Business details save and persist after reload
- [ ] Add three catalog items (e.g. dakpannen leggen per m², dakgoot per m, dakraam per stuk)
- [ ] Recording is blocked with a clear message when the catalog is empty

## Recording
- [ ] Mic permission prompt appears on first record
- [ ] Denying permission shows the Dutch fallback message, app stays usable
- [ ] Record a real Flemish description, e.g. "Tachtig vierkante meter dakpannen
      vervangen op een woning van dertig jaar oud, en twaalf meter dakgoot vernieuwen"
- [ ] Transcript shown under "Wat ik gehoord heb" matches what was said
- [ ] Line items appear with materials and labor split per task
- [ ] Quantities extracted correctly (80 m², 12 m)

## Clarifications
- [ ] At least one clarification is raised for the description above
- [ ] "Vraag afspelen" speaks the question in intelligible Dutch
- [ ] Recording a relevant spoken answer resolves the question
- [ ] Recording a nonsense answer ("euh, ja") produces a rephrased question
- [ ] After two unhelpful answers, the manual-completion message appears
- [ ] "Niet van toepassing" dismisses a question
- [ ] Finalize stays disabled while any question is pending

## Quote and PDF
- [ ] Editing a quantity updates the total live
- [ ] Changing a line's VAT rate moves it to the other subtotal group
- [ ] Mixed 6%/21% quote shows two subtotal groups
- [ ] Finalize is blocked until customer name and address are filled in
- [ ] Finalizing produces a downloadable PDF
- [ ] PDF letterhead shows company name, address, BTW number
- [ ] PDF shows the 6% attestation notice when any line is at 6%
- [ ] PDF totals match the on-screen totals exactly
- [ ] A finalized quote is read-only

## Observability
- [ ] pipeline_events has rows for upload, transcribe, extract, tts_generate,
      clarification_answer, and pdf_generate for the test quote
- [ ] Forcing a failure (e.g. a bad OPENAI_API_KEY) writes an error row with a
      usable message
