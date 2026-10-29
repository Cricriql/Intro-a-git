/** Chilean CLP amounts use `.` as thousands separator and `,` as decimal. */

export function parseClpAmount(raw: string): number | null {
  const cleaned = raw.replace(/\$/g, "").replace(/\s+/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "+") return null;

  let sign = 1;
  let body = cleaned;
  if (body.startsWith("-")) {
    sign = -1;
    body = body.slice(1);
  } else if (body.startsWith("+")) {
    body = body.slice(1);
  }

  if (!/^[\d.]+(?:,\d{1,2})?$/.test(body)) return null;

  const normalized = body.includes(",")
    ? body.replace(/\./g, "").replace(",", ".")
    : body.replace(/\./g, "");

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  return sign * value;
}

export function formatClp(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(Math.round(amount));
  return `${sign}$${abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}
