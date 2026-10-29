import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { parseStatementText } from "../lib/parse-statement.js";
import { mergeParsedTransactions } from "../lib/store.js";

export default defineTool({
  description: prompt`
    Ingest raw email HTML/text or PDF-extracted statement text when Gmail
    secrets are not configured yet, or the user uploads a file in chat.
  `,
  execution: "server",
  effect: "idempotent",
  inputSchema: z.object({
    text: z.string().min(1),
    label: z.string().optional(),
  }),
  async execute({ text, label }, ctx) {
    const parsed = parseStatementText(text);
    const merge = await mergeParsedTransactions(ctx.host.kv, parsed.transactions);
    return {
      ok: true,
      label: label ?? null,
      source: parsed.source,
      parsed: parsed.transactions.length,
      added: merge.added,
      skipped: merge.skipped,
      sample: parsed.transactions.slice(0, 5).map((t) => ({
        id: t.id,
        date: t.date,
        merchant: t.merchant,
        amount: t.amount,
        category: t.proposedCategory,
      })),
    };
  },
});
