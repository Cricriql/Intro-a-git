import { createHash } from "node:crypto";
import type { StatementSource } from "./types.js";

export function transactionId(parts: {
  source: StatementSource;
  date: string;
  description: string;
  amount: number;
  reference?: string;
}): string {
  const base = [
    parts.source,
    parts.date,
    parts.description.trim().toUpperCase(),
    String(parts.amount),
    parts.reference ?? "",
  ].join("|");
  return createHash("sha256").update(base).digest("hex").slice(0, 16);
}
