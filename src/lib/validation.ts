// Think of this as the rulebook for what's allowed in our forms: customers, jobs, price book items, and change orders.
// (zod is the tool doing the checking.) Money is kept in whole cents and quantities in thousandths so rounding never bites us.

import { z } from "zod";

// A text box that can't be left blank. Stray spaces at the ends get ignored, and the label shows up in the error message.
const requiredText = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

// Text that's allowed to be empty. Missing values count as "nothing" and extra spaces get trimmed.
const optionalText = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    return typeof value === "string" ? value.trim() : value;
  },
  z.string().optional(),
);

// Email is optional, but if someone types something it has to look like a real address.
const optionalEmail = z.preprocess(
  (value) => {
    if (value === null || value === undefined) {
      return undefined;
    }
    return typeof value === "string" ? value.trim() : value;
  },
  z.union([z.literal(""), z.email()]).optional(),
);

// A whole number bigger than zero, up to about 2.1 billion (the biggest the database can hold).
// If it was typed as text, we turn it into a number first.
const positiveWholeNumber = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    return /^\d+$/.test(trimmed) ? Number(trimmed) : value;
  },
  z.number().int().positive().max(2_147_483_647),
);

// A customer needs a name. Email, phone and address are optional.
export const customerSchema = z.object({
  name: requiredText("Customer name"),
  email: optionalEmail,
  phone: optionalText,
  address: optionalText,
});

// One line of an estimate: what it is, how many (in thousandths), and the price per unit in cents.
export const estimateLineSchema = z.object({
  description: requiredText("Line description"),
  quantityMilli: positiveWholeNumber,
  unitPriceCents: positiveWholeNumber,
});

// A job needs a description and at least one estimate line.
export const jobSchema = z.object({
  description: requiredText("Job description"),
  estimateLines: z.array(estimateLineSchema).min(1, "Add at least one estimate line."),
});

// Turns a typed dollar amount like "12.5" into cents (1250). Up to two decimals, and it has to be more than zero.
const dollarAmountToCents = z.preprocess(
  (value) => {
    if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim())) {
      return value;
    }

    const [dollars, cents = ""] = value.trim().split(".");
    return Number(dollars) * 100 + Number(cents.padEnd(2, "0"));
  },
  z.number().int().positive().max(2_147_483_647),
);

// A price book item: a name (up to 120 characters), a unit like "ft" or "each" (up to 24), and a price.
export const pricebookItemSchema = z.object({
  name: requiredText("Item name").pipe(z.string().max(120)),
  unit: requiredText("Unit").pipe(z.string().max(24)),
  priceCents: dollarAmountToCents,
});

// Same as above, plus the ID of the item being edited.
export const pricebookItemUpdateSchema = pricebookItemSchema.extend({
  id: z.uuid(),
});

// One line on a change order: which price book item, and how much of it.
export const changeOrderLineSchema = z.object({
  pricebookItemId: z.uuid(),
  quantityMilli: positiveWholeNumber,
});

// A change order needs a reason (up to 500 characters) and between 1 and 50 lines.
export const changeOrderSchema = z.object({
  reason: requiredText("Reason").pipe(z.string().max(500)),
  lines: z.array(changeOrderLineSchema).min(1).max(50),
});

// Handy labels for the shapes above, so other files know what a valid customer, line or job looks like.
export type CustomerInput = z.infer<typeof customerSchema>;
export type EstimateLineInput = z.infer<typeof estimateLineSchema>;
export type JobInput = z.infer<typeof jobSchema>;
