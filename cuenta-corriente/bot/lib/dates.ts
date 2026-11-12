export type YMD = { year: number; month: number; day: number };

export const TIMEZONE = "America/Santiago";

export function todayInSantiago(now: Date = new Date()): YMD {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Accepts dd/mm/yyyy, dd/mm/yy and the cartola's yearless dd/mm. A yearless
 * date later in the calendar than `today` belongs to the previous year.
 */
export function parseTxDate(date: string, today: YMD = todayInSantiago()): YMD | null {
  const m = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/.exec(date.trim());
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    let year: number;
    if (m[3]) {
      year = Number(m[3]);
      if (year < 100) year += 2000;
    } else {
      year = month > today.month ? today.year - 1 : today.year;
    }
    return { year, month, day };
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(date.trim());
  if (iso) return { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) };
  return null;
}

export function monthKey(d: Pick<YMD, "year" | "month">): string {
  return `${d.year}-${String(d.month).padStart(2, "0")}`;
}

export function dayNumber(d: YMD): number {
  return Math.floor(Date.UTC(d.year, d.month - 1, d.day) / 86_400_000);
}

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS_ES[(m ?? 1) - 1]} ${y}`;
}

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const index = (y ?? 0) * 12 + ((m ?? 1) - 1) + delta;
  return monthKey({ year: Math.floor(index / 12), month: (index % 12) + 1 });
}
