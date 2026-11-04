import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { fetchBankMails, readGmailConfig } from "../lib/gmail.js";
import { parseStatementText } from "../lib/parse-statement.js";
import { publishDashboard } from "../lib/publish-dashboard.js";
import {
  loadGmailSync,
  mergeParsedTransactions,
  saveGmailSync,
} from "../lib/store.js";

export default defineTool({
  description: prompt`
    Sync Banco de Chile emails from Gmail (purchase alerts, cartola, EECC).
    Parses bodies and PDF attachments, upserts transactions into durable memory,
    regenerates the HTML dashboard, and remembers message ids so repeats are skipped.
  `,
  execution: "server",
  effect: "idempotent",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(200).optional().describe("Max emails to fetch (default 50)."),
    fullHistory: z
      .boolean()
      .optional()
      .describe("If true, ignore lastUid cursor and re-scan recent matching mail (still skips seen message ids)."),
  }),
  async execute(input, ctx) {
    const cfg = readGmailConfig();
    if ("error" in cfg) {
      return {
        ok: false,
        error: "missing_gmail_secrets",
        message: cfg.error,
        needSecrets: ["GMAIL_USER", "GMAIL_APP_PASSWORD", "STATEMENT_PDF_PASSWORD"],
      };
    }

    const sync = await loadGmailSync(ctx.host.kv);
    const sinceUid = input.fullHistory ? 0 : sync.lastUid;
    const mails = await fetchBankMails(cfg, {
      sinceUid,
      limit: input.limit ?? 50,
    });

    const seen = new Set(sync.seenMessageIds);
    let mailsProcessed = 0;
    let mailsSkipped = 0;
    let txsAdded = 0;
    let txsSkipped = 0;
    const samples: Array<{ subject: string; source: string; added: number }> = [];
    let maxUid = sync.lastUid;

    for (const mail of mails) {
      maxUid = Math.max(maxUid, mail.uid);
      if (seen.has(mail.messageId)) {
        mailsSkipped += 1;
        continue;
      }

      const blobs = [mail.text, ...mail.attachmentTexts.map((a) => a.text)].filter(Boolean);
      let addedHere = 0;
      let source = "unknown";
      for (const blob of blobs) {
        const parsed = parseStatementText(blob);
        if (parsed.transactions.length === 0) continue;
        source = parsed.source;
        const merge = await mergeParsedTransactions(ctx.host.kv, parsed.transactions);
        addedHere += merge.added;
        txsAdded += merge.added;
        txsSkipped += merge.skipped;
      }

      seen.add(mail.messageId);
      mailsProcessed += 1;
      samples.push({ subject: mail.subject, source, added: addedHere });
    }

    const next = {
      seenMessageIds: [...seen],
      lastUid: maxUid,
      lastSyncAt: new Date().toISOString(),
    };
    await saveGmailSync(ctx.host.kv, next);

    const dashboard = await publishDashboard({
      kv: ctx.host.kv,
      files: ctx.host.files,
      artifacts: ctx.artifacts,
    });

    return {
      ok: true,
      mailsFetched: mails.length,
      mailsProcessed,
      mailsSkipped,
      txsAdded,
      txsSkipped,
      lastUid: next.lastUid,
      lastSyncAt: next.lastSyncAt,
      samples: samples.slice(-10),
      dashboard: {
        artifactId: dashboard.artifactId,
        path: dashboard.path,
        transactionCount: dashboard.transactionCount,
      },
      hint:
        txsAdded === 0 && mailsProcessed === 0
          ? "Sin correos nuevos. El HTML igual se regeneró con la memoria actual."
          : "Memoria y HTML actualizados. Pregunta el estado o abre el artifact spend-dashboard.",
    };
  },
});
