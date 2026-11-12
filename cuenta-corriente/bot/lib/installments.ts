import { parseClpAmount } from "./money.js";
import type { StoredTransaction } from "./types.js";

export type VisaInstallment = {
  current: number;
  total: number;
  /** Amount billed on this statement (the monthly cuota). */
  cuota: number;
  /** Full purchase price. */
  purchase: number;
  reference: string | null;
};

/**
 * Visa lines end with `04/06 $ 75.330`: cuota 4 of 6, and the last amount is
 * what this statement charges. The first amount is the whole purchase.
 * `01/01` is a normal purchase, not a plan.
 */
export function parseVisaInstallment(raw: string): VisaInstallment | null {
  // Skip the purchase date dd/mm/yy: that pair is either followed by /yy
  // or is the yy sitting after another dd/.
  const mark = raw.match(/(?<!\d{2}\/)(\d{2})\/(\d{2})(?!\/)/);
  if (!mark) return null;
  const current = Number(mark[1]);
  const total = Number(mark[2]);
  if (total < 2 || current < 1 || current > total) return null;

  const amounts = [...raw.matchAll(/\$\s*(-?[\d.]+)/g)]
    .map((m) => parseClpAmount(m[1]!))
    .filter((n): n is number => n !== null && n > 0);
  const cuota = amounts.at(-1);
  const purchase = amounts[0];
  if (cuota === undefined || purchase === undefined) return null;

  const reference = raw.match(/\d{2}\/\d{2}\/\d{2,4}\s+(\d{6,})/)?.[1] ?? null;
  return { current, total, cuota, purchase, reference };
}

/** Statement charge. Installment plans bill the cuota, not the full price. */
export function billedAmount(tx: { source: string; amount: number; raw: string }): number {
  if (tx.source !== "visa" || tx.amount >= 0) return tx.amount;
  const inst = parseVisaInstallment(tx.raw);
  if (!inst) return tx.amount;
  return -inst.cuota;
}

export type OpenPlan = {
  name: string;
  reference: string;
  current: number;
  total: number;
  cuota: number;
  /** Cuotas still to be billed after the one already on a statement. */
  remaining: number;
  nextAmount: number;
  laterAmount: number;
};

export function openInstallments(txs: StoredTransaction[]): OpenPlan[] {
  const byRef = new Map<string, OpenPlan>();
  for (const tx of txs) {
    if (tx.source !== "visa" || tx.amount >= 0) continue;
    const inst = parseVisaInstallment(tx.raw);
    if (!inst || inst.current >= inst.total) continue;
    const reference = inst.reference ?? `${tx.merchant}:${inst.purchase}`;
    const remaining = inst.total - inst.current;
    const plan: OpenPlan = {
      name: tx.description.replace(/\s*TASA\s*INT\.?.*$/i, "").trim() || tx.merchant,
      reference,
      current: inst.current,
      total: inst.total,
      cuota: inst.cuota,
      remaining,
      nextAmount: inst.cuota,
      laterAmount: inst.cuota * (remaining - 1),
    };
    const prev = byRef.get(reference);
    if (!prev || plan.current > prev.current) byRef.set(reference, plan);
  }
  return [...byRef.values()].sort((a, b) => b.cuota - a.cuota);
}
