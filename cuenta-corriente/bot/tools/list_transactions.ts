import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { formatClp } from "../lib/money.js";
import { loadTransactions } from "../lib/store.js";

export default defineTool({
  description:
    "List stored transactions. Filter by category, uncategorized-only, source, or merchant substring.",
  execution: "server",
  effect: "read",
  inputSchema: z.object({
    uncategorizedOnly: z.boolean().optional().describe("When true, only rows without a confirmed category."),
    category: z.string().optional().describe("Exact category filter, e.g. comida."),
    source: z.enum(["cartola", "visa", "compra_alerta", "unknown"]).optional(),
    merchantContains: z.string().optional().describe("Case-insensitive merchant substring."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  }),
  async execute(input, ctx) {
    const limit = input.limit ?? 50;
    let txs = await loadTransactions(ctx.host.kv);

    if (input.uncategorizedOnly) {
      txs = txs.filter((tx) => !tx.category);
    }
    if (input.category) {
      txs = txs.filter((tx) => tx.category === input.category);
    }
    if (input.source) {
      txs = txs.filter((tx) => tx.source === input.source);
    }
    if (input.merchantContains) {
      const needle = input.merchantContains.toUpperCase();
      txs = txs.filter((tx) => tx.merchant.includes(needle));
    }

    const total = txs.length;
    const items = txs.slice(0, limit).map((tx) => ({
      id: tx.id,
      date: tx.date,
      merchant: tx.merchant,
      description: tx.description,
      amount: tx.amount,
      amountFormatted: formatClp(tx.amount),
      category: tx.category,
      proposedCategory: tx.proposedCategory,
      source: tx.source,
    }));

    return { total, returned: items.length, items };
  },
});
