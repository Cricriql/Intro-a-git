import { parseCartolaText } from "./parse-cartola.js";
import { looksLikeCompraAlerta, parseCompraAlertaText } from "./parse-compra-alerta.js";
import { parseVisaText } from "./parse-visa.js";
import type { ParsedTransaction, StatementSource } from "./types.js";

export type ParseResult = {
  source: StatementSource;
  transactions: ParsedTransaction[];
  lineCount: number;
};

export function detectSource(text: string): StatementSource {
  if (looksLikeCompraAlerta(text)) return "compra_alerta";

  const sample = text.slice(0, 4000);
  const cartolaHits = (sample.match(/^D\d{2}\/\d{2}\s/gm) ?? []).length;
  const visaHits = (sample.match(/\d{2}\/\d{2}\/\d{2}\s+\d{6,}/g) ?? []).length;
  if (cartolaHits >= 2 && cartolaHits >= visaHits) return "cartola";
  if (visaHits >= 2) return "visa";
  if (cartolaHits >= 1) return "cartola";
  if (visaHits >= 1) return "visa";
  if (/CARTOLA|CUENTA\s+CORRIENTE|TRASPASO\s+A:/i.test(sample)) return "cartola";
  if (/TARJETA\s+DE\s+CR[EÉ]DITO|ESTADO\s+DE\s+CUENTA\s+NACIONAL|UBER\s*EATS/i.test(sample)) {
    return "visa";
  }
  return "unknown";
}

export function parseStatementText(text: string, sourceHint?: StatementSource): ParseResult {
  const source = sourceHint && sourceHint !== "unknown" ? sourceHint : detectSource(text);
  const lineCount = text.split(/\r?\n/).filter((l) => l.trim()).length;

  if (source === "compra_alerta") {
    return { source, transactions: parseCompraAlertaText(text), lineCount };
  }
  if (source === "cartola") {
    return { source, transactions: parseCartolaText(text), lineCount };
  }
  if (source === "visa") {
    return { source, transactions: parseVisaText(text), lineCount };
  }

  const compra = parseCompraAlertaText(text);
  if (compra.length > 0) {
    return { source: "compra_alerta", transactions: compra, lineCount };
  }

  const cartola = parseCartolaText(text);
  const visa = parseVisaText(text);
  if (cartola.length >= visa.length && cartola.length > 0) {
    return { source: "cartola", transactions: cartola, lineCount };
  }
  if (visa.length > 0) {
    return { source: "visa", transactions: visa, lineCount };
  }
  return { source: "unknown", transactions: [], lineCount };
}
