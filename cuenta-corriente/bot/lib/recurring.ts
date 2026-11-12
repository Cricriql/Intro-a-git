import { normalizeMerchant } from "./categories.js";
import { monthKey, parseTxDate, shiftMonth, todayInSantiago, type YMD } from "./dates.js";
import { isCardPayment, spendTransactions } from "./monthly.js";
import type { Kv } from "./store.js";
import type { StoredTransaction } from "./types.js";

const RECURRING_KEY = "recurring_payments";
const CARD_ID = "tarjeta_credito";
const BILL_CATEGORIES = new Set([
  "suscripciones",
  "servicios",
  "vivienda",
  "fitness",
  "donaciones",
  "bancario",
  "salud",
]);
const EVERYDAY_CATEGORIES = new Set(["comida", "supermercado", "transporte", "entretenimiento"]);

export type RecurringPayment = {
  id: string;
  name: string;
  /** Normalized substring matched against merchant + description. */
  match: string;
  dueDay?: number;
  expectedAmount?: number;
  createdAt: string;
  /** Hidden from the checklist and never suggested again. */
  dismissed?: boolean;
};

export type ChecklistStatus = "pagado" | "pendiente" | "atrasado";

export type ChecklistItem = {
  id: string;
  name: string;
  match: string;
  suggested: boolean;
  status: ChecklistStatus;
  dueDay: number | null;
  expectedAmount: number | null;
  paid: { date: string; amount: number; description: string; source: string }[];
  paidTotal: number;
};

export type Checklist = { month: string; items: ChecklistItem[] };

type JsonValue = Parameters<Kv["put"]>[1];

export async function loadRecurringPayments(kv: Kv): Promise<RecurringPayment[]> {
  const raw = await kv.get(RECURRING_KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is RecurringPayment =>
      Boolean(x) &&
      typeof x === "object" &&
      typeof (x as RecurringPayment).id === "string" &&
      typeof (x as RecurringPayment).match === "string",
  ) as RecurringPayment[];
}

export async function saveRecurringPayments(kv: Kv, items: RecurringPayment[]): Promise<void> {
  await kv.put(RECURRING_KEY, items as unknown as JsonValue);
}

export function recurringId(match: string): string {
  return normalizeMerchant(match)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function matches(tx: StoredTransaction, match: string): boolean {
  return normalizeMerchant(`${tx.merchant} ${tx.description}`).includes(normalizeMerchant(match));
}

/** Merchants that look like monthly bills from the 3 months before `month`. */
export function suggestRecurring(
  txs: StoredTransaction[],
  month: string,
  configured: RecurringPayment[],
  today: YMD = todayInSantiago(),
): { name: string; match: string; months: number; typicalAmount: number }[] {
  const window = new Set([shiftMonth(month, -1), shiftMonth(month, -2), shiftMonth(month, -3)]);
  const byMerchant = new Map<string, { months: Set<string>; amounts: number[]; category: string }>();
  for (const tx of spendTransactions(txs, today)) {
    if (!window.has(tx.month) || !tx.merchant) continue;
    const entry = byMerchant.get(tx.merchant) ?? {
      months: new Set<string>(),
      amounts: [],
      category: tx.effectiveCategory,
    };
    entry.months.add(tx.month);
    entry.amounts.push(Math.abs(tx.amount));
    byMerchant.set(tx.merchant, entry);
  }

  const out: { name: string; match: string; months: number; typicalAmount: number }[] = [];
  for (const [merchant, entry] of byMerchant) {
    if (entry.months.size < 2 || EVERYDAY_CATEGORIES.has(entry.category)) continue;
    const min = Math.min(...entry.amounts);
    const max = Math.max(...entry.amounts);
    const steadyAmount = min > 0 && max / min <= 1.25;
    if (!BILL_CATEGORIES.has(entry.category) && !steadyAmount) continue;
    if (configured.some((c) => normalizeMerchant(merchant).includes(normalizeMerchant(c.match)))) {
      continue;
    }
    const sorted = [...entry.amounts].sort((a, b) => a - b);
    out.push({
      name: merchant,
      match: merchant,
      months: entry.months.size,
      typicalAmount: sorted[Math.floor(sorted.length / 2)] ?? 0,
    });
  }
  return out.sort((a, b) => b.typicalAmount - a.typicalAmount);
}

export function buildChecklist(
  txs: StoredTransaction[],
  configured: RecurringPayment[],
  today: YMD = todayInSantiago(),
  month: string = monthKey(today),
): Checklist {
  const inMonth = txs.filter((tx) => {
    if (tx.amount >= 0) return false;
    const ymd = parseTxDate(tx.date, today);
    return ymd !== null && monthKey(ymd) === month;
  });
  const current = monthKey(today);
  // Account debits are only visible once a cartola covering that day arrives.
  const cartolaDays = txs
    .filter((tx) => tx.source === "cartola")
    .map((tx) => parseTxDate(tx.date, today))
    .filter((d): d is YMD => d !== null && monthKey(d) === month)
    .map((d) => d.day);
  const visibleUntil = Math.max(0, ...cartolaDays);

  const status = (paidCount: number, dueDay: number | null): ChecklistStatus => {
    if (paidCount > 0) return "pagado";
    if (month > current) return "pendiente";
    if (month < current) return cartolaDays.length ? "atrasado" : "pendiente";
    return dueDay !== null && today.day > dueDay && visibleUntil >= dueDay ? "atrasado" : "pendiente";
  };

  const toItem = (
    base: { id: string; name: string; match: string; dueDay?: number; expectedAmount?: number },
    suggested: boolean,
    hits: StoredTransaction[],
  ): ChecklistItem => ({
    id: base.id,
    name: base.name,
    match: base.match,
    suggested,
    dueDay: base.dueDay ?? null,
    expectedAmount: base.expectedAmount ?? null,
    status: status(hits.length, base.dueDay ?? null),
    paid: hits.map((tx) => ({
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      source: tx.source,
    })),
    paidTotal: hits.reduce((s, tx) => s + Math.abs(tx.amount), 0),
  });

  // The cartola debit and the Visa "MONTO CANCELADO" line are the same payment.
  const cardHits = inMonth.filter(isCardPayment);
  const cardPaid = cardHits.some((tx) => tx.source === "cartola")
    ? cardHits.filter((tx) => tx.source === "cartola")
    : cardHits;

  const items: ChecklistItem[] = [
    toItem({ id: CARD_ID, name: "Pago tarjeta de crédito", match: "PAGO TC" }, false, cardPaid),
    ...configured.filter((c) => !c.dismissed).map((c) =>
      toItem(c, false, inMonth.filter((tx) => !isCardPayment(tx) && matches(tx, c.match))),
    ),
    ...suggestRecurring(txs, month, configured, today).map((s) =>
      toItem(
        { id: recurringId(s.match), name: s.name, match: s.match, expectedAmount: s.typicalAmount },
        true,
        inMonth.filter((tx) => !isCardPayment(tx) && matches(tx, s.match)),
      ),
    ),
  ];

  return { month, items };
}
