import { parseCartolaText } from "./parse-cartola.js";
import { looksLikeCompraAlerta, parseCompraAlertaText } from "./parse-compra-alerta.js";
import { parseVisaText } from "./parse-visa.js";
import { parseStatementSummary } from "./statement-summary.js";
import type { ParsedTransaction, StatementSource } from "./types.js";

export type ParseResult = {
  source: StatementSource;
  transactions: ParsedTransaction[];
  lineCount: number;
};

/** Filename of the bank PDF, when the mail attachment still has one. */
export function sourceFromFilename(filename: string): StatementSource | undefined {
  const name = filename.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (/eecc|tarjeta\s*visa|estado\s+de\s+cuenta\s+tarjeta/i.test(name)) return "visa";
  if (/cartola|cuenta\s*corriente/i.test(name)) return "cartola";
  return undefined;
}

export function detectSource(text: string): StatementSource {
  if (looksLikeCompraAlerta(text)) return "compra_alerta";
  // Titles first. A column-broken PDF has no "date + reference" on one line,
  // so counting patterns would miss the document entirely.
  if (/ESTADO\s+DE\s+CUENTA\s+NACIONAL\s+DE\s+TARJETA\s+DE\s+CR[EÉ]DITO/i.test(text)) {
    return "visa";
  }
  if (/EECC\s*Tarjeta\s*Visa/i.test(text)) return "visa";
  if (
    /Cartola\s*Cuenta\s*Corriente\s*Nacional/i.test(text) ||
    /CARTOLA[\s\S]{0,160}CUENTA\s+CORRIENTE/i.test(text)
  ) {
    return "cartola";
  }

  const sample = text.slice(0, 4000);
  const cartolaHits = (sample.match(/^D\d{2}\/\d{2}\s/gm) ?? []).length;
  const visaHits = (sample.match(/\d{2}\/\d{2}\/\d{2}\s+\d{6,}/g) ?? []).length;
  if (cartolaHits >= 2 && cartolaHits >= visaHits) return "cartola";
  if (visaHits >= 2) return "visa";
  if (cartolaHits >= 1) return "cartola";
  if (visaHits >= 1) return "visa";
  if (/CARTOLA|CUENTA\s+CORRIENTE|TRASPASO\s+A:/i.test(sample)) return "cartola";
  if (/TARJETA\s+DE\s+CR[EÉ]DITO|UBER\s*EATS/i.test(sample)) {
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
    return {
      source,
      transactions: parseVisaText(text, parseStatementSummary(text)?.periodTo),
      lineCount,
    };
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
    return {
      source: "visa",
      transactions: visa.map((tx) => ({
        ...tx,
        statementTo: tx.statementTo ?? parseStatementSummary(text)?.periodTo ?? null,
      })),
      lineCount,
    };
  }
  return { source: "unknown", transactions: [], lineCount };
}
