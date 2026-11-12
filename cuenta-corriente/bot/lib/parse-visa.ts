import { parseClpAmount } from "./money.js";
import { normalizeMerchant, suggestCategory } from "./categories.js";
import type { ParsedTransaction } from "./types.js";
import { transactionId } from "./ids.js";

/**
 * One national Visa movement, whether pypdf kept it on one line or broke
 * every column onto its own line. Four-digit years are accepted.
 *
 *   SANTIAGO 23/08/26 240800242840 PAYU *UBER EATS $ 13.593 $ 13.593 01/01 $ 13.593
 *   23/09/2026 240900000000 MONTO CANCELADO $ -1.370.959 $ -1.370.959 01/01 $ -1.370.959
 */
const MOVEMENT_RE =
  /(?:^|\s)(?:([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ .]{0,30}?)\s+)?(\d{2}\/\d{2}\/\d{2}(?:\d{2})?)\s+(\d{6,})\s+(.+?)\s+\$?\s*(-?[\d.]{1,16})\s+\$?\s*(-?[\d.]{1,16})\s+(\d{2}\/\d{2})\s+\$?\s*(-?[\d.]{1,16})/gi;

export function parseVisaText(text: string, statementTo?: string | null): ParsedTransaction[] {
  const flat = text.replace(/\r?\n+/g, " ").replace(/\s{2,}/g, " ");
  const out: ParsedTransaction[] = [];
  const seen = new Set<string>();

  for (const match of flat.matchAll(MOVEMENT_RE)) {
    const place = match[1]?.trim() ?? "";
    const date = match[2]!;
    const reference = match[3]!;
    let description = match[4]!.replace(/\s{2,}/g, " ").trim();
    const purchase = parseClpAmount(match[5]!);
    const second = parseClpAmount(match[6]!);
    const cuotaMark = match[7]!;
    const valorCuota = parseClpAmount(match[8]!);
    if (purchase === null || valorCuota === null) continue;
    if (/^(TOTAL|PER[IÍ]ODO|CUPO|SIN\s+MOVIMIENTOS)/i.test(description)) continue;

    const key = `${date}|${reference}|${description}`;
    if (seen.has(key)) continue;
    seen.add(key);

    description = description
      .replace(/\s+(SANTIAGO|LAS CONDES|NUNOA|PROVIDENCIA|VITACURA|MAIPU|LA REINA)\s*$/i, "")
      .trim();

    const raw = [
      place,
      date,
      reference,
      description,
      `$ ${formatRawAmount(purchase)}`,
      `$ ${formatRawAmount(second ?? purchase)}`,
      cuotaMark,
      `$ ${formatRawAmount(valorCuota)}`,
    ]
      .filter(Boolean)
      .join(" ");

    const merchant = extractVisaMerchant(description);
    const proposed = suggestCategory(description, merchant);
    const signed = purchase > 0 ? -purchase : purchase;

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
      statementTo: statementTo ?? null,
      raw,
    });
  }
  return out;
}

function formatRawAmount(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(Math.round(amount));
  return `${sign}${abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
}

function extractVisaMerchant(description: string): string {
  const starred = /\*\s*([A-Z0-9][A-Z0-9 \-.*]+)/i.exec(description);
  if (starred) return starred[1]!.trim();
  return description
    .replace(/^(PAYU|RAPYD|FUDO|TRANSBANK)\s+/i, "")
    .replace(/^\*\s*/, "")
    .trim();
}
