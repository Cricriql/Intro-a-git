import { dayNumber, monthKey, parseTxDate, todayInSantiago, type YMD } from "./dates.js";
import { billedAmount } from "./installments.js";
import { isCardPayment, type DatedTx } from "./monthly.js";
import type { StoredTransaction } from "./types.js";

const BALANCE_RE = /SALDO\s+(INICIAL|FINAL)/i;
const SALARY_RE = /PAGO:?\s*DE\s+(SUELDOS?|ANTICIPO|REMUNERACI)/i;

export type AccountSplit = {
  /** Last purchase date on the latest Visa statement. Alerts after this are unbilled. */
  statementTo: YMD | null;
  statementFrom: YMD | null;
  /** Checking-account spend (cartola), without the payment that settles the card. */
  corriente: DatedTx[];
  /** Purchases on the latest Visa statement. */
  facturada: DatedTx[];
  /** Purchases on older Visa statements. */
  facturadaOlder: DatedTx[];
  /** Card purchases after the latest statement, seen only as email alerts. */
  noFacturada: DatedTx[];
  /** Cartola debits that pay the credit card. */
  cardPayments: DatedTx[];
};

function annotate(tx: StoredTransaction, today: YMD): DatedTx | null {
  const ymd = parseTxDate(tx.date, today);
  if (!ymd) return null;
  return {
    ...tx,
    ymd,
    month: monthKey(ymd),
    effectiveCategory: tx.category ?? tx.proposedCategory ?? "sin_categoria",
  };
}

function byDateDesc(a: DatedTx, b: DatedTx): number {
  return dayNumber(b.ymd) - dayNumber(a.ymd);
}

/**
 * One EECC is one statement. Lines stamped with the PDF period stay together,
 * including installment rows whose purchase date is months older. Lines with
 * no stamp (older imports) are one statement too: splitting them by date gaps
 * dropped those cuotas and the totals went to zero.
 */
function latestStatement(visa: DatedTx[], today: YMD): DatedTx[] {
  const stamped = visa.filter((tx) => tx.statementTo);
  if (stamped.length === 0) return visa;
  const latest = stamped.reduce((best, tx) => {
    const end = parseTxDate(tx.statementTo ?? "", today);
    const bestEnd = parseTxDate(best.statementTo ?? "", today);
    if (!end) return best;
    if (!bestEnd || dayNumber(end) > dayNumber(bestEnd)) return tx;
    return best;
  });
  return visa.filter((tx) => tx.statementTo === latest.statementTo);
}

export function splitAccounts(
  txs: StoredTransaction[],
  today: YMD = todayInSantiago(),
): AccountSplit {
  const dated: DatedTx[] = [];
  for (const tx of txs) {
    if (tx.amount >= 0 || BALANCE_RE.test(tx.description) || SALARY_RE.test(tx.description)) {
      continue;
    }
    const row = annotate(tx, today);
    if (row) dated.push(row);
  }

  const cardPayments = dated
    .filter((tx) => tx.source === "cartola" && isCardPayment(tx))
    .sort(byDateDesc);
  const corriente = dated
    .filter((tx) => tx.source === "cartola" && !isCardPayment(tx))
    .sort(byDateDesc);
  const visa = dated
    .filter((tx) => tx.source === "visa" && !isCardPayment(tx))
    .map((tx) => ({ ...tx, amount: billedAmount(tx) }));
  const statementItems = latestStatement(visa, today);
  const facturada = [...statementItems].sort(byDateDesc);
  const facturadaOlder = visa
    .filter((tx) => !statementItems.includes(tx))
    .sort(byDateDesc);

  const periodEnd = facturada
    .map((tx) => (tx.statementTo ? parseTxDate(tx.statementTo, today) : null))
    .find((ymd): ymd is YMD => ymd !== null);
  const statementTo = periodEnd ?? (facturada.length
    ? facturada.reduce((a, b) => (dayNumber(a.ymd) > dayNumber(b.ymd) ? a : b)).ymd
    : null);
  const statementFrom = facturada.length
    ? facturada.reduce((a, b) => (dayNumber(a.ymd) < dayNumber(b.ymd) ? a : b)).ymd
    : null;
  const cutoffDay = statementTo ? dayNumber(statementTo) : null;

  const noFacturada = dated
    .filter(
      (tx) => tx.source === "compra_alerta" && (cutoffDay === null || dayNumber(tx.ymd) > cutoffDay),
    )
    .sort(byDateDesc);

  return { statementTo, statementFrom, corriente, facturada, facturadaOlder, noFacturada, cardPayments };
}

export function sumAmount(txs: DatedTx[]): number {
  return txs.reduce((s, tx) => s + Math.abs(tx.amount), 0);
}
