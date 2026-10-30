import type { Category } from "./categories.js";

export type StatementSource = "cartola" | "visa" | "compra_alerta" | "unknown";

export type ParsedTransaction = {
  id: string;
  source: StatementSource;
  date: string;
  /** Optional HH:mm from purchase alerts. */
  time?: string;
  description: string;
  merchant: string;
  /** Signed CLP: negative = spend/cargo, positive = abono/ingreso. */
  amount: number;
  currency: "CLP";
  proposedCategory: Category | null;
  cardLast4?: string;
  raw: string;
};

export type StoredTransaction = ParsedTransaction & {
  category: Category | null;
  updatedAt: string;
  createdAt: string;
};

export type TrackingCadence = "weekly" | "daily" | "biweekly" | "uncategorized_only";

export type TrackingPreference = {
  cadence: TrackingCadence;
  updatedAt: string;
};
