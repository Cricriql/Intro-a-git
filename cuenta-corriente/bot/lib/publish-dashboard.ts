import type { ArtifactsApi, HostFilesApi } from "@grok/agent-sdk";
import { buildDashboardHtml } from "./dashboard-html.js";
import { loadRecurringPayments } from "./recurring.js";
import {
  loadGmailSync,
  loadMerchantRules,
  loadTransactions,
  type Kv,
} from "./store.js";

export const DASHBOARD_PATH = "dashboard/estado.html";
export const ARTIFACT_KEY = "spend-dashboard";

export async function publishDashboard(deps: {
  kv: Kv;
  files: HostFilesApi;
  artifacts: ArtifactsApi;
}): Promise<{
  path: string;
  artifactId: string;
  generatedAt: string;
  transactionCount: number;
  lastSyncAt: string | null;
}> {
  const transactions = await loadTransactions(deps.kv);
  const rules = await loadMerchantRules(deps.kv);
  const sync = await loadGmailSync(deps.kv);
  const recurring = await loadRecurringPayments(deps.kv);
  const generatedAt = new Date().toISOString();
  const html = buildDashboardHtml({
    generatedAt,
    timezoneLabel: "America/Santiago",
    sync,
    transactions,
    learnedMerchants: Object.keys(rules).length,
    recurring,
  });

  await deps.files.write(DASHBOARD_PATH, html, { scope: "deployment" });
  const artifact = await deps.artifacts.tag({
    kind: "spend-dashboard",
    key: ARTIFACT_KEY,
    title: "Estado de gastos (HTML)",
    data: {
      generatedAt,
      transactionCount: transactions.length,
      lastSyncAt: sync.lastSyncAt,
    },
    contents: html,
    contentType: "text/html; charset=utf-8",
  });

  return {
    path: DASHBOARD_PATH,
    artifactId: artifact.id,
    generatedAt,
    transactionCount: transactions.length,
    lastSyncAt: sync.lastSyncAt,
  };
}
