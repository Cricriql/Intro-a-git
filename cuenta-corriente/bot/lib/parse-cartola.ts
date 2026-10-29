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
  /^D(\d{2}\/\d{2})\s+(.+?)\s+((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?)(?:\s+((?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?))?\s*$/;

export function parseCartolaText(text: string): ParsedTransaction[] {
  const out: ParsedTransaction[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!/^D\d{2}\/\d{2}\s/.test(line)) continue;

    const match = LINE_RE.exec(line);
    if (!match) continue;

    const date = match[1]!;
    let description = match[2]!.trim();
    const amountRaw = match[3]!;
    const amount = parseClpAmount(amountRaw);
    if (amount === null) continue;

    const isCredit =
      /TRASPASO\s+DE:|TRANSFERENCIA\s+DESDE|ABONO|DEPOSITO|SALDO\s*INICIAL/i.test(
        description,
      );
    const signed = isCredit ? Math.abs(amount) : -Math.abs(amount);

    description = description.replace(/\s+(CENTRAL|INTERNET|OFICINA|ATM)\s*$/i, "").trim();

    const merchant = extractCartolaMerchant(description);
    const proposed = suggestCategory(description, merchant);

    out.push({
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
      raw: line,
    });
  }
  return out;
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
