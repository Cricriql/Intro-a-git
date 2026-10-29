import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { parseStatementText } from "../lib/parse-statement.js";
import { mergeParsedTransactions } from "../lib/store.js";
import type { StatementSource } from "../lib/types.js";

export default defineTool({
  description: prompt`
    Parse Banco de Chile statement text or a purchase-alert email body.
    Accepts cartola cuenta corriente text, EECC Visa text, or
    "Compra con Tarjeta de Crédito" alert HTML/plain.
    Upserts transactions into durable memory (idempotent by id).
  `,
  execution: "server",
  effect: "idempotent",
  inputSchema: z.object({
    text: z.string().min(1).describe("Raw PDF-extracted text or email body"),
    sourceHint: z
      .enum(["cartola", "visa", "compra_alerta", "unknown"])
      .optional()
      .describe("Force a parser when autodetection is wrong."),
    label: z.string().optional().describe("Optional label e.g. cartola-2026-09"),
  }),
  async execute({ text, sourceHint, label }, ctx) {
    const parsed = parseStatementText(text, sourceHint as StatementSource | undefined);
    const merge = await mergeParsedTransactions(ctx.host.kv, parsed.transactions);

    return {
      label: label ?? null,
      source: parsed.source,
      lineCount: parsed.lineCount,
      parsed: parsed.transactions.length,
      added: merge.added,
      skipped: merge.skipped,
      updated: merge.updated,
      sample: parsed.transactions.slice(0, 5).map((t) => ({
        id: t.id,
        date: t.date,
        time: t.time ?? null,
        merchant: t.merchant,
        description: t.description,
        amount: t.amount,
        proposedCategory: t.proposedCategory,
        source: t.source,
      })),
    };
  },
});
