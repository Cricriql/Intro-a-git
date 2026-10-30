import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { CATEGORIES, isCategory } from "../lib/categories.js";
import { setTransactionCategory } from "../lib/store.js";

export default defineTool({
  description:
    "Confirm a category for a transaction id and/or merchant. By default learns merchant→category for future imports.",
  execution: "server",
  effect: "idempotent",
  inputSchema: z
    .object({
      id: z.string().optional().describe("Transaction id from list_transactions / parse_statement."),
      merchant: z.string().optional().describe("Merchant key to categorize (and optionally learn)."),
      category: z
        .string()
        .describe(`One of: ${CATEGORIES.join(", ")}`),
      learnMerchant: z
        .boolean()
        .optional()
        .describe("Persist merchant→category rule (default true)."),
    })
    .refine((v) => Boolean(v.id || v.merchant), {
      message: "Provide id and/or merchant.",
    }),
  async execute(input, ctx) {
    if (!isCategory(input.category)) {
      return {
        ok: false,
        error: `unknown_category`,
        allowed: [...CATEGORIES],
      };
    }
    const result = await setTransactionCategory(ctx.host.kv, {
      id: input.id,
      merchant: input.merchant,
      category: input.category,
      learnMerchant: input.learnMerchant,
    });
    return {
      ok: true,
      matched: result.matched,
      category: result.category,
      learnedMerchant: result.learnedMerchant,
    };
  },
});
