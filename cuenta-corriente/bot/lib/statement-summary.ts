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
  /** "TOTAL TRANSACCIONES EN CUOTAS" on this statement. */
  cuotasFacturadas: number | null;
  /** "TOTAL TRANSACCIONES EN UNA CUOTA" on this statement. */
  comprasContado: number | null;
};

function absAmount(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = parseClpAmount(raw);
  return value === null ? null : Math.abs(value);
}

/**
 * Banco de Chile prints the label and the amount far apart, and several
 * section totals put the amount before the $. Walk every label hit and keep
 * an amount that actually sits next to that hit.
 */
function labeledAmount(text: string, label: RegExp, avoid?: RegExp): number | null {
  const re = new RegExp(label.source, label.flags.includes("g") ? label.flags : `${label.flags}g`);
  for (const match of text.matchAll(re)) {
    const start = match.index ?? 0;
    if (avoid?.test(text.slice(start, start + 90))) continue;
    const window = text.slice(start + match[0].length, start + match[0].length + 80);
    const raw =
      window.match(/\$\s*(-?[\d.]{1,16})/)?.[1] ??
      window.match(/(-?[\d.]{1,16})\s*\$/)?.[1];
    const value = absAmount(raw);
    if (value !== null && value > 0) return value;
  }
  return null;
}

/** Cupo total, utilizado and disponible are the first three $ amounts after that header row. */
function cupoTrio(text: string): { total: number; utilizado: number; disponible: number } | null {
  const at = text.search(/CUPO\s+TOTAL\s+CUPO\s+UTILIZADO\s+CUPO\s+DISPONIBLE/i);
  if (at < 0) return null;
  const amounts = [...text.slice(at, at + 4000).matchAll(/\$\s*(-?[\d.]{1,16})/g)]
    .map((m) => absAmount(m[1]))
    .filter((n): n is number => n !== null);
  if (amounts.length < 3) return null;
  return { total: amounts[0]!, utilizado: amounts[1]!, disponible: amounts[2]! };
}

/**
 * Reads the statement header: período, monto facturado, cupo utilizado and
 * the installment balance the bank keeps inside that used credit.
 */
export function parseStatementSummary(text: string): StatementSummary | null {
  const flat = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  const fechaEstado = flat.match(/FECHA\s+ESTADO\s+DE\s+CUENTA\s+(\d{2}\/\d{2}\/\d{4})/i)?.[1] ?? null;
  const pairs = [...flat.matchAll(/(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})/g)];
  const period =
    pairs.find((m) => fechaEstado !== null && m[2] === fechaEstado) ??
    pairs.find((m) => !/PR[OÓ]XIMO/i.test(flat.slice(Math.max(0, m.index! - 40), m.index))) ??
    null;
  const inlinePeriod = flat.match(
    /PER[IÍ]ODO\s+FACTURADO(?:\s+DESDE)?\s+(\d{2}\/\d{2}\/\d{2,4})\s+(?:HASTA\s+|AL\s+)?(\d{2}\/\d{2}\/\d{2,4})/i,
  );
  const cupo = cupoTrio(flat);
  const repeated = [...flat.matchAll(/\$\s*(-?[\d.]{1,16})\s+\$\s*(-?[\d.]{1,16})/g)]
    .map((m) => [absAmount(m[1]), absAmount(m[2])] as const)
    .find(([a, b]) => a !== null && a === b && a > 1000)?.[0] ?? null;
  const summary: StatementSummary = {
    periodFrom: inlinePeriod?.[1] ?? period?.[1] ?? null,
    periodTo: inlinePeriod?.[2] ?? period?.[2] ?? fechaEstado,
    montoFacturado:
      labeledAmount(flat, /MONTO\s+TOTAL\s+FACTURADO/i, /PER[IÍ]ODO\s+ANTERIOR|M[IÍ]NIMO/i) ??
      repeated,
    cupoUtilizado: cupo?.utilizado ?? labeledAmount(flat, /CUPO\s+UTILIZADO/i, /ACELERACI[OÓ]N|SOLICITE/i),
    cupoTotal: cupo?.total ?? labeledAmount(flat, /CUPO\s+TOTAL(?!\s+DISPONIBLE)/i),
    cupoDisponible: cupo?.disponible ?? labeledAmount(flat, /CUPO\s+DISPONIBLE/i),
    saldoCuotas: labeledAmount(
      flat,
      /SALDO\s+(?:EN\s+)?CUOTAS|SALDO\s+POR\s+FACTURAR|CUOTAS\s+POR\s+FACTURAR|TOTAL\s+(?:DE\s+)?CUOTAS\s+POR\s+FACTURAR/i,
    ),
    cuotasFacturadas: labeledAmount(flat, /TOTAL\s+TRANSACCIONES\s+EN\s+CUOTAS/i),
    comprasContado: labeledAmount(flat, /TOTAL\s+TRANSACCIONES\s+EN\s+UNA\s+CUOTA/i),
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
    cuotasFacturadas: incoming.cuotasFacturadas ?? current.cuotasFacturadas,
    comprasContado: incoming.comprasContado ?? current.comprasContado,
  };
}
