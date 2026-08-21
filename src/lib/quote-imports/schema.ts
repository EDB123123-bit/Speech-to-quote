import { z } from 'zod';

export const ProvenanceSchema = z.object({
  state: z.enum(['observed', 'inferred', 'missing']),
  pageNumber: z.number().int().positive().nullable(),
  sourceText: z.string().nullable(),
});

const textField = z.object({ value: z.string().nullable(), provenance: ProvenanceSchema });
const numberField = z.object({ value: z.number().nullable(), provenance: ProvenanceSchema });
const integerField = z.object({ value: z.number().int().nullable(), provenance: ProvenanceSchema });

export const ExtractedPartySchema = z.object({
  name: textField,
  address: textField,
  street: textField,
  postalCode: textField,
  city: textField,
  vatNumber: textField,
  enterpriseNumber: textField,
  email: textField,
  phone: textField,
  iban: textField,
});

export const ExtractedQuoteLineSchema = z.object({
  description: textField,
  notes: textField,
  quantity: numberField,
  unit: textField,
  unitCode: textField,
  unitPriceExclCents: integerField,
  vatRatePercent: integerField,
  vatCategory: z.object({
    value: z.enum(['S', 'AE']).nullable(),
    provenance: ProvenanceSchema,
  }),
  lineTotalExclCents: integerField,
});

export const ExtractedQuoteDocumentSchema = z.object({
  documentType: z.enum(['quote', 'invoice', 'credit_note', 'other']),
  language: z.enum(['nl', 'fr', 'mixed', 'other']),
  currency: z.string(),
  containsMultipleQuotes: z.boolean(),
  containsDiscountOrAllowance: z.boolean(),
  seller: ExtractedPartySchema,
  customer: ExtractedPartySchema,
  quote: z.object({
    number: textField,
    issueDate: textField,
    validUntil: textField,
    orderReference: textField,
  }),
  lines: z.array(ExtractedQuoteLineSchema).max(250),
  totals: z.object({
    subtotalExclCents: integerField,
    vatTotalCents: integerField,
    grandTotalCents: integerField,
    vatGroups: z.array(z.object({
      vatRatePercent: z.number().int(),
      taxableAmountCents: z.number().int(),
      vatAmountCents: z.number().int(),
    })).max(6),
  }),
});

const reviewLineShape = {
  description: z.string().trim().min(1),
  notes: z.string().nullable(),
  quantity: z.number().positive(),
  unit: z.string(),
  unitCode: z.enum(['MTK', 'HUR', 'C62', 'MTR', 'KGM']).nullable(),
  unitPriceCents: z.number().int().nonnegative(),
  vatRate: z.union([z.literal(0), z.literal(0.06), z.literal(0.21)]),
  vatCategory: z.enum(['S', 'AE']),
  lineType: z.enum(['materials', 'labor', 'combined']).default('combined'),
};

export const ReviewedQuoteLineSchema = z.object(reviewLineShape);
export const ApprovableQuoteLineSchema = z.object({
  ...reviewLineShape,
  unit: z.string().trim().min(1),
}).superRefine((line, context) => {
  if (line.vatCategory === 'AE' && line.vatRate !== 0) {
    context.addIssue({ code: 'custom', message: 'Verlegging vereist 0% btw.', path: ['vatRate'] });
  }
  if (line.vatCategory === 'S' && line.vatRate === 0) {
    context.addIssue({ code: 'custom', message: 'Standaard-btw vereist 6% of 21%.', path: ['vatRate'] });
  }
});

export const ReviewedQuotePayloadSchema = z.object({
  customer: z.object({
    name: z.string().nullable(),
    address: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  quote: z.object({
    number: z.string().nullable(),
    issueDate: z.string().nullable(),
    validUntil: z.string().nullable(),
    orderReference: z.string().nullable(),
  }),
  lines: z.array(ReviewedQuoteLineSchema).min(1).max(250),
  sourceTotals: z.object({
    subtotalCents: z.number().int().nullable(),
    vatTotalCents: z.number().int().nullable(),
    totalCents: z.number().int().nullable(),
  }),
  inferredPaths: z.array(z.string()),
});

export const ApprovableQuotePayloadSchema = ReviewedQuotePayloadSchema.extend({
  lines: z.array(ApprovableQuoteLineSchema).min(1).max(250),
});

export type ExtractedQuoteDocument = z.infer<typeof ExtractedQuoteDocumentSchema>;
export type ReviewedQuotePayload = z.infer<typeof ReviewedQuotePayloadSchema>;
