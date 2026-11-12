import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { splitAccounts, sumAmount } from "../lib/accounts.js";
import { openInstallments } from "../lib/installments.js";
import { formatYmd, monthLabel } from "../lib/dates.js";
import { formatClp } from "../lib/money.js";
import { loadGmailSync, loadMerchantRules, loadStatementSummary, loadTransactions } from "../lib/store.js";

export default defineTool({
  description: prompt`
    Estado de cuenta / gastos desde la memoria durable: totales por fuente,
    categorías, último sync Gmail, y la separación entre cuenta corriente,
    tarjeta facturada (último estado de cuenta Visa) y tarjeta no facturada
    (avisos de compra posteriores a ese estado).
    Prefiere esto cuando el usuario pregunte "cómo voy", "estado", "cuánto llevo"
    o "qué tengo facturado".
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

    const accounts = splitAccounts(txs);
    const corrienteMonths = [...new Set(accounts.corriente.map((tx) => tx.month))].sort();
    const corrienteMonth = corrienteMonths.at(-1) ?? null;
    const paid = accounts.cardPayments.find((tx) => /CARGO POR PAGO TC/i.test(tx.description));
    const plans = openInstallments(txs);
    const nextCuotas = plans.reduce((sum, plan) => sum + plan.nextAmount, 0);
    const laterCuotas = plans.reduce((sum, plan) => sum + plan.laterAmount, 0);

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
      accounts: {
        corriente: {
          month: corrienteMonth,
          monthLabel: corrienteMonth ? monthLabel(corrienteMonth) : null,
          totalFormatted: formatClp(
            sumAmount(accounts.corriente.filter((tx) => tx.month === corrienteMonth)),
          ),
          note: "No incluye el pago de la tarjeta ni el sueldo. La cartola llega a fin de mes.",
        },
        tarjetaFacturada: {
          from: accounts.statementFrom ? formatYmd(accounts.statementFrom) : null,
          to: accounts.statementTo ? formatYmd(accounts.statementTo) : null,
          totalFormatted: formatClp(sumAmount(accounts.facturada)),
          paidFromChecking: paid
            ? { date: paid.date, totalFormatted: formatClp(Math.abs(paid.amount)) }
            : null,
          note: "El total es la suma de las cuotas (valor cuota) del estado de cuenta. El pago desde la cuenta es una confirmación aparte y puede incluir saldo anterior o intereses que no están en las líneas de compra.",
        },
        tarjetaNoFacturada: {
          conocido: false,
          comprasAvisadas: {
            count: accounts.noFacturada.length,
            precioFormatted: formatClp(sumAmount(accounts.noFacturada)),
            after: accounts.statementTo ? formatYmd(accounts.statementTo) : null,
          },
          note: "El precio de las compras avisadas no es el monto a facturar. Si la compra fue en cuotas, la cuota que entra ahora y el saldo que sigue en el utilizado se conocen cuando llega el estado de cuenta.",
        },
        cuotasEnUtilizado: {
          totalFormatted: formatClp(nextCuotas + laterCuotas),
          entranEnElProximoEstadoFormatted: formatClp(nextCuotas),
          mesesSiguientesFormatted: formatClp(laterCuotas),
          statement: await loadStatementSummary(ctx.host.kv),
        },
        cuotas: {
          nextStatementFormatted: formatClp(nextCuotas),
          laterMonthsFormatted: formatClp(laterCuotas),
          plans: plans.map((plan) => ({
            name: plan.name,
            progress: `${plan.current} de ${plan.total}`,
            cuotaFormatted: formatClp(plan.cuota),
            nextFormatted: formatClp(plan.nextAmount),
            laterFormatted: formatClp(plan.laterAmount),
          })),
        },
      },
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
