// ACEN's offer terms (SPEC section 2). These are the only fixed numbers in the app.
// Source: ACEN's presentation on the date below, not a written contract.

export const OFFER = {
  presentationDate: '2026-10-10',
  /** Option A: percent off Meralco's generation charge. */
  discountAPercent: 20,
  /** Option B: fixed PhP per kWh for the term, all in for generation. */
  fixedB: 6.25,
  termYears: 2,
  thresholdKw: 100,
} as const;

/** Option A discount as a fraction. */
export const DISCOUNT_A = OFFER.discountAPercent / 100;

/**
 * Generation rate above which Option B saves more than Option A in a month.
 * Comes from the offer alone: fixedB / (1 - discountA).
 */
export const CROSSOVER_RATE = (OFFER.fixedB * 100) / (100 - OFFER.discountAPercent);

/** Shown in the app as "not yet answered by ACEN". Never state an answer as fact. */
export const OPEN_QUESTIONS: readonly string[] = [
  'Is VAT included in the P6.25, or added on top?',
  'How will the renewal rate be set after 2 years?',
  'If a solar household returns to Meralco, is net metering restored automatically or by fresh application?',
  'Are there exit fees for leaving before the 2 years end?',
  "Does ACEN's bill also cover Meralco's delivery charges, or does Meralco still bill those separately?",
  'With no office and no portal, how does a subscriber raise a billing dispute or get copies of past bills?',
];
