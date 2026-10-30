import type { Category } from "./categories.js";
import { isCategory, normalizeMerchant } from "./categories.js";
import type {
  ParsedTransaction,
  StoredTransaction,
  TrackingCadence,
  TrackingPreference,
} from "./types.js";

const TXS_KEY = "txs";
const RULES_KEY = "merchant_rules";
const PREF_KEY = "tracking_preference";
const GMAIL_SYNC_KEY = "gmail_sync";

export type GmailSyncState = {
  seenMessageIds: string[];
  lastUid: number;
  lastSyncAt: string | null;
};

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type Kv = {
  get: (key: string) => Promise<JsonValue | undefined>;
  put: (key: string, value: JsonValue) => Promise<void>;
  delete?: (key: string) => Promise<void>;
};

export async function loadTransactions(kv: Kv): Promise<StoredTransaction[]> {
  const raw = await kv.get(TXS_KEY);
  return Array.isArray(raw) ? (raw as StoredTransaction[]) : [];
}

export async function saveTransactions(kv: Kv, txs: StoredTransaction[]): Promise<void> {
  await kv.put(TXS_KEY, txs as unknown as JsonValue);
}

export async function loadMerchantRules(kv: Kv): Promise<Record<string, Category>> {
  const raw = await kv.get(RULES_KEY);
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, Category> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && isCategory(value)) {
      out[normalizeMerchant(key)] = value;
    }
  }
  return out;
}

export async function saveMerchantRules(
  kv: Kv,
  rules: Record<string, Category>,
): Promise<void> {
  await kv.put(RULES_KEY, rules as unknown as JsonValue);
}

export async function getTrackingPreference(kv: Kv): Promise<TrackingPreference> {
  const raw = await kv.get(PREF_KEY);
  if (
    raw &&
    typeof raw === "object" &&
    "cadence" in raw &&
    isCadence((raw as TrackingPreference).cadence)
  ) {
    return raw as TrackingPreference;
  }
  return { cadence: "weekly", updatedAt: new Date(0).toISOString() };
}

export async function setTrackingPreference(
  kv: Kv,
  cadence: TrackingCadence,
): Promise<TrackingPreference> {
  const pref: TrackingPreference = { cadence, updatedAt: new Date().toISOString() };
  await kv.put(PREF_KEY, pref as unknown as JsonValue);
  return pref;
}

export function isCadence(value: string): value is TrackingCadence {
  return (
    value === "weekly" ||
    value === "daily" ||
    value === "biweekly" ||
    value === "uncategorized_only"
  );
}

export async function loadGmailSync(kv: Kv): Promise<GmailSyncState> {
  const raw = await kv.get(GMAIL_SYNC_KEY);
  if (raw && typeof raw === "object") {
    const obj = raw as Partial<GmailSyncState>;
    return {
      seenMessageIds: Array.isArray(obj.seenMessageIds)
        ? obj.seenMessageIds.filter((x): x is string => typeof x === "string")
        : [],
      lastUid: typeof obj.lastUid === "number" ? obj.lastUid : 0,
      lastSyncAt: typeof obj.lastSyncAt === "string" ? obj.lastSyncAt : null,
    };
  }
  return { seenMessageIds: [], lastUid: 0, lastSyncAt: null };
}

export async function saveGmailSync(kv: Kv, state: GmailSyncState): Promise<void> {
  // Cap seen ids so kv stays bounded.
  const seenMessageIds = state.seenMessageIds.slice(-2000);
  await kv.put(GMAIL_SYNC_KEY, {
    seenMessageIds,
    lastUid: state.lastUid,
    lastSyncAt: state.lastSyncAt,
  } as unknown as JsonValue);
}

export type MergeResult = {
  added: number;
  skipped: number;
  updated: number;
  transactions: StoredTransaction[];
};

export async function mergeParsedTransactions(
  kv: Kv,
  parsed: ParsedTransaction[],
): Promise<MergeResult> {
  const existing = await loadTransactions(kv);
  const rules = await loadMerchantRules(kv);
  const byId = new Map(existing.map((tx) => [tx.id, tx]));
  const now = new Date().toISOString();
  let added = 0;
  let skipped = 0;
  let updated = 0;

  for (const item of parsed) {
    const fromRule = rules[item.merchant];
    const proposed = fromRule ?? item.proposedCategory;
    const prev = byId.get(item.id);
    if (prev) {
      skipped += 1;
      // Refresh soft proposal when still uncategorized.
      if (!prev.category && proposed && prev.proposedCategory !== proposed) {
        byId.set(item.id, { ...prev, proposedCategory: proposed, updatedAt: now });
        updated += 1;
      }
      continue;
    }
    byId.set(item.id, {
      ...item,
      proposedCategory: proposed,
      category: fromRule ?? null,
      createdAt: now,
      updatedAt: now,
    });
    added += 1;
  }

  const transactions = [...byId.values()].sort(compareTx);
  await saveTransactions(kv, transactions);
  return { added, skipped, updated, transactions };
}

export async function setTransactionCategory(
  kv: Kv,
  input: {
    id?: string;
    merchant?: string;
    category: Category;
    learnMerchant?: boolean;
  },
): Promise<{
  matched: number;
  learnedMerchant: string | null;
  category: Category;
}> {
  const txs = await loadTransactions(kv);
  const now = new Date().toISOString();
  let matched = 0;
  const merchantKey = input.merchant ? normalizeMerchant(input.merchant) : null;

  const next = txs.map((tx) => {
    const byId = input.id !== undefined && tx.id === input.id;
    const byMerchant = merchantKey !== null && tx.merchant === merchantKey;
    if (!byId && !byMerchant) return tx;
    matched += 1;
    return { ...tx, category: input.category, updatedAt: now };
  });

  if (matched > 0) {
    await saveTransactions(kv, next);
  }

  let learnedMerchant: string | null = null;
  if (input.learnMerchant !== false) {
    const rules = await loadMerchantRules(kv);
    if (merchantKey) {
      rules[merchantKey] = input.category;
      learnedMerchant = merchantKey;
      await saveMerchantRules(kv, rules);
    } else if (input.id) {
      const hit = txs.find((tx) => tx.id === input.id);
      if (hit?.merchant) {
        rules[hit.merchant] = input.category;
        learnedMerchant = hit.merchant;
        await saveMerchantRules(kv, rules);
      }
    }
  }

  return { matched, learnedMerchant, category: input.category };
}

function compareTx(a: StoredTransaction, b: StoredTransaction): number {
  const da = dateKey(a.date);
  const db = dateKey(b.date);
  if (da !== db) return da - db;
  return a.description.localeCompare(b.description);
}

function dateKey(date: string): number {
  const m = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/.exec(date);
  if (!m) return 0;
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : 2026;
  if (year < 100) year += 2000;
  return year * 10_000 + month * 100 + day;
}
