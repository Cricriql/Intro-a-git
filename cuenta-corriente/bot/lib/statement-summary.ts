import { parseTxDate, todayInSantiago, type YMD } from "./dates.js";
import { parseClpAmount } from "./money.js";

/** Figures printed on the Visa statement, apart from each purchase line. */
export type StatementSummary = {
  periodFrom: string | null;
  periodTo: string | null;
  montoFacturado: number | null;
  cupoUtilizado: number | null;
  cupoTotal: number | null;
  cupoDisponible: number | null;
  /** Installments the bank still counts as used credit, not yet billed. */
  saldoCuotas: number | null;
};

function amountAfter(text: string, label: RegExp): number | null {
  const match = label.exec(text);
  if (!match) return null;
  const window = text.slice(match.index, match.index + 90);
  const amount = window.match(/\$\s*(-?[\d.]{1,16})/);
  if (!amount) return null;
  const value = parseClpAmount(amount[1]!);
  return value === null ? null : Math.abs(value);
}

/**
 * Reads the statement header: período, monto facturado, cupo utilizado and
 * the installment balance the bank keeps inside that used credit.
 */
export function parseStatementSummary(text: string): StatementSummary | null {
  const flat = text.replace(/\s+/g, " ");
  const period = flat.match(
    /PER[IÍ]ODO\s+FACTURADO(?:\s+DESDE)?\s+(\d{2}\/\d{2}\/\d{2,4})\s+(?:HASTA\s+|AL\s+)?(\d{2}\/\d{2}\/\d{2,4})/i,
  );
  const summary: StatementSummary = {
    periodFrom: period?.[1] ?? null,
    periodTo: period?.[2] ?? null,
    montoFacturado: amountAfter(flat, /MONTO\s+TOTAL\s+FACTURADO|TOTAL\s+A\s+PAGAR/i),
    cupoUtilizado: amountAfter(flat, /CUPO\s+UTILIZADO/i),
    cupoTotal: amountAfter(flat, /CUPO\s+TOTAL(?!\s+DISPONIBLE)/i),
    cupoDisponible: amountAfter(flat, /CUPO\s+DISPONIBLE/i),
    saldoCuotas: amountAfter(
      flat,
      /SALDO\s+(?:EN\s+)?CUOTAS|SALDO\s+POR\s+FACTURAR|CUOTAS\s+POR\s+FACTURAR|TOTAL\s+(?:DE\s+)?CUOTAS\s+POR\s+FACTURAR/i,
    ),
  };
  const hasMoney = Object.entries(summary).some(
    ([key, value]) => key !== "periodFrom" && key !== "periodTo" && value !== null,
  );
  if (!hasMoney && !summary.periodTo) return null;
  return summary;
}

function periodDay(date: string | null, today: YMD): number {
  if (!date) return 0;
  const ymd = parseTxDate(date, today);
  if (!ymd) return 0;
  return ymd.year * 10_000 + ymd.month * 100 + ymd.day;
}

/** Keeps the summary from the latest statement period. */
export function preferSummary(
  current: StatementSummary | null,
  incoming: StatementSummary | null,
  today: YMD = todayInSantiago(),
): StatementSummary | null {
  if (!incoming) return current;
  if (!current) return incoming;
  const next = periodDay(incoming.periodTo, today);
  const prev = periodDay(current.periodTo, today);
  if (next !== prev) return next > prev ? incoming : current;
  return {
    periodFrom: incoming.periodFrom ?? current.periodFrom,
    periodTo: incoming.periodTo ?? current.periodTo,
    montoFacturado: incoming.montoFacturado ?? current.montoFacturado,
    cupoUtilizado: incoming.cupoUtilizado ?? current.cupoUtilizado,
    cupoTotal: incoming.cupoTotal ?? current.cupoTotal,
    cupoDisponible: incoming.cupoDisponible ?? current.cupoDisponible,
    saldoCuotas: incoming.saldoCuotas ?? current.saldoCuotas,
  };
}
