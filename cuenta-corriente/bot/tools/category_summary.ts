import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { formatClp } from "../lib/money.js";
import { loadTransactions } from "../lib/store.js";

export default defineTool({
  description:
    "Summarize spend by category (confirmed, else proposed). Useful for weekly tracking digests.",
  execution: "server",
  effect: "read",
  inputSchema: z.object({
    includeUncategorized: z
      .boolean()
      .optional()
      .describe("Include an uncategorized bucket (default true)."),
  }),
  async execute(input, ctx) {
    const includeUncategorized = input.includeUncategorized ?? true;
    const txs = await loadTransactions(ctx.host.kv);
    const buckets = new Map<string, { count: number; total: number }>();

    for (const tx of txs) {
      const key = tx.category ?? (includeUncategorized ? tx.proposedCategory ?? "sin_categoria" : null);
      if (key === null) continue;
      const bucket = buckets.get(key) ?? { count: 0, total: 0 };
      bucket.count += 1;
      // Spend totals use absolute cargo amounts; credits reduce spend.
      bucket.total += tx.amount;
      buckets.set(key, bucket);
    }

    const categories = [...buckets.entries()]
      .map(([category, stats]) => ({
        category,
        count: stats.count,
        total: stats.total,
        totalFormatted: formatClp(stats.total),
        spendFormatted: formatClp(-Math.min(0, stats.total)),
      }))
      .sort((a, b) => a.total - b.total);

    const spendTotal = txs.reduce((sum, tx) => sum + Math.min(0, tx.amount), 0);
    const incomeTotal = txs.reduce((sum, tx) => sum + Math.max(0, tx.amount), 0);

    return {
      transactionCount: txs.length,
      uncategorizedCount: txs.filter((tx) => !tx.category).length,
      spendTotal,
      spendTotalFormatted: formatClp(Math.abs(spendTotal)),
      incomeTotal,
      incomeTotalFormatted: formatClp(incomeTotal),
      categories,
    };
  },
});
