import { parseClpAmount } from "./money.js";
import { normalizeMerchant, suggestCategory } from "./categories.js";
import type { ParsedTransaction } from "./types.js";
import { transactionId } from "./ids.js";

/**
 * Banco de Chile "Compra con Tarjeta de Crédito" alert body, e.g.:
 * Te informamos que se ha realizado una compra por $3.980 con Tarjeta de
 * Crédito ****1324 en MERPAGO*CONVENIENCEDE el 28/10/2026 10:39.
 */
export function parseCompraAlertaText(text: string): ParsedTransaction[] {
  const flat = text
    .replace(/&eacute;/gi, "é")
    .replace(/&aacute;/gi, "á")
    .replace(/&iacute;/gi, "í")
    .replace(/&oacute;/gi, "ó")
    .replace(/&uacute;/gi, "ú")
    .replace(/&ntilde;/gi, "ñ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const re =
    /compra por \$([\d.]+) con Tarjeta de Cr[eé]dito (\*{2,}\d{2,4}) en (.+?) el (\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/gi;

  const out: ParsedTransaction[] = [];
  for (const match of flat.matchAll(re)) {
    const amount = parseClpAmount(match[1]!);
    if (amount === null) continue;
    const cardLast4 = match[2]!.replace(/\*/g, "").slice(-4);
    const merchantRaw = match[3]!.trim().replace(/\s+/g, " ");
    const date = match[4]!;
    const time = match[5];
    const merchant = normalizeMerchant(merchantRaw);
    const description = merchantRaw;
    const signed = -Math.abs(amount);

    out.push({
      id: transactionId({
        source: "compra_alerta",
        date,
        description,
        amount: signed,
        reference: `${cardLast4}:${time ?? ""}`,
      }),
      source: "compra_alerta",
      date,
      time,
      description,
      merchant,
      amount: signed,
      currency: "CLP",
      proposedCategory: suggestCategory(description, merchant),
      cardLast4,
      raw: match[0]!,
    });
  }
  return out;
}

export function looksLikeCompraAlerta(text: string): boolean {
  return /compra por \$[\d.]+ con Tarjeta de Cr/i.test(text) ||
    /Subject:\s*Compra con Tarjeta de Cr/i.test(text) ||
    /Compra con Tarjeta de Cr[eé]dito/i.test(text.slice(0, 2000));
}
