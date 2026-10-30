import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { formatClp } from "../lib/money.js";
import { loadGmailSync, loadMerchantRules, loadTransactions } from "../lib/store.js";

export default defineTool({
  description: prompt`
    Estado de cuenta / gastos desde la memoria durable: totales por fuente,
    categorías confirmadas vs propuestas, último sync Gmail, y gasto reciente.
    Prefiere esto cuando el usuario pregunte "cómo voy", "estado", o "cuánto llevo".
  `,
  execution: "server",
  effect: "read",
  inputSchema: z.object({
    recentDays: z.number().int().min(1).max(90).optional().describe("Ventana reciente en días (default 30)."),
  }),
  async execute(input, ctx) {
    const recentDays = input.recentDays ?? 30;
    const txs = await loadTransactions(ctx.host.kv);
    const rules = await loadMerchantRules(ctx.host.kv);
    const sync = await loadGmailSync(ctx.host.kv);

    const bySource: Record<string, { count: number; spend: number; income: number }> = {};
    const byCategory: Record<string, { count: number; total: number }> = {};
    let confirmed = 0;
    let proposedOnly = 0;
    let uncategorized = 0;

    for (const tx of txs) {
      const src = bySource[tx.source] ?? { count: 0, spend: 0, income: 0 };
      src.count += 1;
      if (tx.amount < 0) src.spend += tx.amount;
      else src.income += tx.amount;
      bySource[tx.source] = src;

      if (tx.category) confirmed += 1;
      else if (tx.proposedCategory) proposedOnly += 1;
      else uncategorized += 1;

      const cat = tx.category ?? tx.proposedCategory ?? "sin_categoria";
      const bucket = byCategory[cat] ?? { count: 0, total: 0 };
      bucket.count += 1;
      bucket.total += tx.amount;
      byCategory[cat] = bucket;
    }

    const cutoff = Date.now() - recentDays * 86400000;
    const recentSpend = txs
      .filter((tx) => tx.amount < 0 && approxTime(tx.date) >= cutoff)
      .reduce((s, tx) => s + tx.amount, 0);

    const lastPayment = txs
      .filter(
        (tx) =>
          /MONTO CANCELADO|CARGO POR PAGO TC|TOTAL PAGOS/i.test(tx.description) ||
          /MONTO CANCELADO|CARGO POR PAGO TC/i.test(tx.merchant),
      )
      .sort((a, b) => approxTime(b.date) - approxTime(a.date))[0];

    return {
      transactionCount: txs.length,
      confirmedCategories: confirmed,
      proposedOnly,
      uncategorized,
      learnedMerchants: Object.keys(rules).length,
      gmail: {
        lastSyncAt: sync.lastSyncAt,
        seenMessages: sync.seenMessageIds.length,
        lastUid: sync.lastUid,
      },
      bySource: Object.fromEntries(
        Object.entries(bySource).map(([k, v]) => [
          k,
          {
            count: v.count,
            spendFormatted: formatClp(Math.abs(v.spend)),
            incomeFormatted: formatClp(v.income),
          },
        ]),
      ),
      categories: Object.entries(byCategory)
        .map(([category, v]) => ({
          category,
          count: v.count,
          total: v.total,
          totalFormatted: formatClp(v.total),
        }))
        .sort((a, b) => a.total - b.total),
      recentSpendFormatted: formatClp(Math.abs(recentSpend)),
      recentDays,
      lastPaymentHint: lastPayment
        ? {
            date: lastPayment.date,
            description: lastPayment.description,
            amountFormatted: formatClp(lastPayment.amount),
          }
        : null,
    };
  },
});

function approxTime(date: string): number {
  const m = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/.exec(date);
  if (!m) {
    const iso = Date.parse(date);
    return Number.isFinite(iso) ? iso : 0;
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : 2026;
  if (year < 100) year += 2000;
  return Date.UTC(year, month - 1, day);
}
