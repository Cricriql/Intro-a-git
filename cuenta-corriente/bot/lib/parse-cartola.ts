import { parseClpAmount } from "./money.js";
import { normalizeMerchant, suggestCategory } from "./categories.js";
import type { ParsedTransaction } from "./types.js";
import { transactionId } from "./ids.js";

/**
 * Cartola nacional lines look like:
 *   D01/09 PAGO:MASS CENTRAL 5.940 1.155.764
 *   D01/09 TRASPASO A:[PERSONA] INTERNET 67.000
 *   D31/08 SALDO INICIAL 1.347.954
 */
const LINE_RE =
  /^D?(\d{2}\/\d{2})\s+(.+?)\s+((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)(?:\s+((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?))?\s*$/;
const AMOUNT_TOKEN = /^(?:\d{1,3}(?:\.\d{3})+|\d{1,7})(?:,\d{1,2})?$/;

export function parseCartolaText(text: string): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^D?\d{2}\/\d{2}\s/.test(line) || /^\d{2}\/\d{2}\//.test(line)) continue;
    const tx = movementFrom(line, LINE_RE.exec(line));
    if (tx) out.push(tx);
  }
  if (out.length > 0) return out;
  if (!/CARTOLA|CUENTA\s+CORRIENTE/i.test(text)) return [];
  return parseCartolaColumns(text);
}

/** PDF extracts that put each column on its own line. */
function parseCartolaColumns(text: string): ParsedTransaction[] {
  const flat = text.replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ").trim();
  const marks = [...flat.matchAll(/(?:^|\s)D?(\d{2}\/\d{2})(?!\/)(?=\s)/g)];
  const out: ParsedTransaction[] = [];
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i]!;
    const from = mark.index! + mark[0].length;
    const to = i + 1 < marks.length ? marks[i + 1]!.index! : flat.length;
    const chunk = flat.slice(from, to).trim();
    const tokens = chunk.split(/\s+/).filter(Boolean);
    const amounts: string[] = [];
    while (tokens.length && AMOUNT_TOKEN.test(tokens[tokens.length - 1]!) && amounts.length < 2) {
      amounts.unshift(tokens.pop()!);
    }
    const description = tokens.join(" ").trim();
    if (!description || amounts.length === 0) continue;
    if (/^(DESDE|HASTA|FECHA|CARTOLA|CUENTA|PAGINA|N[°º])/i.test(description)) continue;
    const tx = movementFrom(`${mark[1]} ${description} ${amounts.join(" ")}`, [
      "",
      mark[1]!,
      description,
      amounts[0]!,
      amounts[1],
    ]);
    if (tx) out.push(tx);
  }
  return out;
}

function movementFrom(
  raw: string,
  match: RegExpExecArray | string[] | null,
): ParsedTransaction | null {
  if (!match) return null;
  const date = match[1]!;
  let description = match[2]!.trim();
  const amount = parseClpAmount(match[3]!);
  if (amount === null || description.length < 3) return null;

  const isCredit =
    /TRASPASO\s+DE:|TRANSFERENCIA\s+DESDE|ABONO|DEPOSITO|SALDO\s*INICIAL|PAGO:?\s*DE\s+(SUELDOS?|ANTICIPO|REMUNERACI)/i.test(
      description,
    );
  const signed = isCredit ? Math.abs(amount) : -Math.abs(amount);
  description = description.replace(/\s+(CENTRAL|INTERNET|OFICINA|ATM)\s*$/i, "").trim();
  const merchant = extractCartolaMerchant(description);
  const proposed = suggestCategory(description, merchant);

  return {
    id: transactionId({
      source: "cartola",
      date,
      description,
      amount: signed,
    }),
    source: "cartola",
    date,
    description,
    merchant: normalizeMerchant(merchant),
    amount: signed,
    currency: "CLP",
    proposedCategory: proposed,
    raw,
  };
}

function extractCartolaMerchant(description: string): string {
  const pago = /^PAGO:(.+)$/i.exec(description);
  if (pago) return pago[1]!.trim();
  const traspaso = /^TRASPASO\s+(?:A|DE):(.+)$/i.exec(description);
  if (traspaso) return traspaso[1]!.trim();
  const pac = /^PAC\s+(.+)$/i.exec(description);
  if (pac) return pac[1]!.trim();
  return description;
}
