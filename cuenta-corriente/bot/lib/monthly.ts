import { dayNumber, monthKey, parseTxDate, todayInSantiago, type YMD } from "./dates.js";
import { billedAmount } from "./installments.js";
import type { StoredTransaction } from "./types.js";

const CARD_PAYMENT_RE = /MONTO CANCELADO|CARGO POR PAGO TC|PAGO TARJETA DE CREDITO|PAGO\s+TC\b/i;
const BALANCE_RE = /SALDO\s+(INICIAL|FINAL)/i;
// Older imports stored salary deposits with a negative sign.
const SALARY_RE = /PAGO:?\s*DE\s+(SUELDOS?|ANTICIPO|REMUNERACI)/i;

export function isCardPayment(tx: StoredTransaction): boolean {
  return CARD_PAYMENT_RE.test(tx.description) || CARD_PAYMENT_RE.test(tx.merchant);
}

export type DatedTx = StoredTransaction & { ymd: YMD; month: string; effectiveCategory: string };

/**
 * Real spending only: card payments and balance rows are excluded, and a Visa
 * statement line is dropped when a purchase alert for the same amount exists
 * within 3 days (the alert already counted it).
 */
export function spendTransactions(
  txs: StoredTransaction[],
  today: YMD = todayInSantiago(),
): DatedTx[] {
  const dated: DatedTx[] = [];
  for (const tx of txs) {
    if (
      tx.amount >= 0 ||
      isCardPayment(tx) ||
      BALANCE_RE.test(tx.description) ||
      SALARY_RE.test(tx.description)
    ) {
      continue;
    }
    const ymd = parseTxDate(tx.date, today);
    if (!ymd) continue;
    dated.push({
      ...tx,
      ymd,
      month: monthKey(ymd),
      effectiveCategory: tx.category ?? tx.proposedCategory ?? "sin_categoria",
    });
  }

  const alertsByAmount = new Map<number, number[]>();
  for (const tx of dated) {
    if (tx.source !== "compra_alerta") continue;
    const list = alertsByAmount.get(tx.amount) ?? [];
    list.push(dayNumber(tx.ymd));
    alertsByAmount.set(tx.amount, list);
  }

  return dated
    .filter((tx) => {
      if (tx.source !== "visa") return true;
      const days = alertsByAmount.get(tx.amount);
      if (!days) return true;
      const day = dayNumber(tx.ymd);
      const hit = days.findIndex((d) => Math.abs(d - day) <= 3);
      if (hit === -1) return true;
      days.splice(hit, 1);
      return false;
    })
    .map((tx) => ({ ...tx, amount: billedAmount(tx) }));
}

export type MonthBreakdown = {
  month: string;
  total: number;
  count: number;
  categories: { category: string; total: number; count: number }[];
};

export function monthlyBreakdown(spend: DatedTx[]): MonthBreakdown[] {
  const byMonth = new Map<string, Map<string, { total: number; count: number }>>();
  for (const tx of spend) {
    const cats = byMonth.get(tx.month) ?? new Map();
    const bucket = cats.get(tx.effectiveCategory) ?? { total: 0, count: 0 };
    bucket.total += Math.abs(tx.amount);
    bucket.count += 1;
    cats.set(tx.effectiveCategory, bucket);
    byMonth.set(tx.month, cats);
  }
  return [...byMonth.entries()]
    .map(([month, cats]) => {
      const categories = [...cats.entries()]
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.total - a.total);
      return {
        month,
        total: categories.reduce((s, c) => s + c.total, 0),
        count: categories.reduce((s, c) => s + c.count, 0),
        categories,
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}
