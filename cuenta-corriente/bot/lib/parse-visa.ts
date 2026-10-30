import { parseClpAmount } from "./money.js";
import { normalizeMerchant, suggestCategory } from "./categories.js";
import type { ParsedTransaction } from "./types.js";
import { transactionId } from "./ids.js";

/**
 * Visa EECC movement lines look like:
 *   SANTIAGO 23/08/26 240800242840  PAYU   *UBER EATS      SANTIAGO  $          13.593  $          13.593 01/01  $          13.593
 *   22/08/26 240800000000  MONTO CANCELADO  $      -1.123.373  ...
 */
const VISA_RE =
  /^(?:([A-ZÁÉÍÓÚÑÜ? ]+?)\s+)?(\d{2}\/\d{2}\/\d{2})\s+(\d{6,})\s+(.+?)\s+\$\s*(-?[\d.]+(?:,\d{1,2})?)\b/i;

export function parseVisaText(text: string): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /TOTAL\s|PER[IÍ]ODO|CUPO\s|SIN\s+MOVIMIENTOS/i.test(line)) continue;
    if (!/\d{2}\/\d{2}\/\d{2}/.test(line) || !/\$/.test(line)) continue;

    const match = VISA_RE.exec(line);
    if (!match) continue;

    const date = match[2]!;
    const reference = match[3]!;
    let description = match[4]!.trim();
    const amount = parseClpAmount(match[5]!);
    if (amount === null) continue;

    // Strip trailing place that often repeats before the first $.
    description = description
      .replace(/\s+(SANTIAGO|LAS CONDES|NUNOA|PROVIDENCIA|VITACURA|MAIPU|LA REINA)\s*$/i, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    const merchant = extractVisaMerchant(description);
    const proposed = suggestCategory(description, merchant);
    // Card purchases are spends (negative). Credits/cancelaciones stay as signed.
    const signed = amount > 0 ? -amount : amount;

    out.push({
      id: transactionId({
        source: "visa",
        date,
        description,
        amount: signed,
        reference,
      }),
      source: "visa",
      date,
      description,
      merchant: normalizeMerchant(merchant),
      amount: signed,
      currency: "CLP",
      proposedCategory: proposed,
      raw: line,
    });
  }
  return out;
}

function extractVisaMerchant(description: string): string {
  const starred = /\*\s*([A-Z0-9][A-Z0-9 \-.*]+)/i.exec(description);
  if (starred) return starred[1]!.trim();
  // Drop processor prefixes like PAYU / RAPYD / FUDO
  return description
    .replace(/^(PAYU|RAPYD|FUDO|TRANSBANK)\s+/i, "")
    .replace(/^\*\s*/, "")
    .trim();
}
