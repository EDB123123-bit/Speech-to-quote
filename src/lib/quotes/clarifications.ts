/**
 * A missing selling price is a valid quote state in V1. It must never become
 * a voice clarification: the contractor can enter or verify it directly on
 * the quote line.
 */
const PRICE_QUESTION_PATTERN = /\b(prijs|prijzen|prijskaart|bedrag|bedragen|kostprijs|kosten|tarief|tarieven|offerteprijs|verkoopprijs)\b/iu;

export function isPriceClarification(question: string): boolean {
  return PRICE_QUESTION_PATTERN.test(question);
}

export function filterPriceClarifications<T extends { questionNl: string }>(items: T[]): T[] {
  return items.filter((item) => item.questionNl.trim().length > 0 && !isPriceClarification(item.questionNl));
}
