import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { spawnSync } from "node:child_process";
import { writeFileSync, unlinkSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type FetchedMail = {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  date: string | null;
  text: string;
  attachmentTexts: Array<{ filename: string; text: string }>;
};

export type GmailConfig = {
  user: string;
  appPassword: string;
  pdfPassword?: string;
};

export function readGmailConfig(): GmailConfig | { error: string } {
  const user = process.env.GMAIL_USER?.trim();
  const appPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  if (!user || !appPassword) {
    return {
      error:
        "Faltan secretos GMAIL_USER y GMAIL_APP_PASSWORD. Crea una contraseña de aplicación en Google (cuenta con 2FA) y configúralas.",
    };
  }
  return {
    user,
    appPassword,
    pdfPassword: process.env.STATEMENT_PDF_PASSWORD?.trim() || undefined,
  };
}

/** Gmail search query for Banco de Chile statements & purchase alerts. */
export function bankSearchQuery(): string {
  return [
    "from:bancochile.cl",
    "OR from:enviodigital@bancochile.cl",
    'OR subject:"Compra con Tarjeta"',
    'OR subject:"Cartola Cuenta Corriente"',
    'OR subject:"Estado de Cuenta Tarjeta"',
  ].join(" ");
}

export async function fetchBankMails(
  cfg: GmailConfig,
  opts: { sinceUid?: number; limit?: number; query?: string } = {},
): Promise<FetchedMail[]> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: cfg.user, pass: cfg.appPassword },
    logger: false,
  });

  const out: FetchedMail[] = [];
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const query = opts.query ?? bankSearchQuery();
      // imapflow search accepts Gmail-raw via complex queries; use OR uid range + from
      const uidsRaw = await client.search({
        or: [
          { from: "bancochile.cl" },
          { from: "enviodigital@bancochile.cl" },
          { subject: "Compra con Tarjeta" },
          { subject: "Cartola Cuenta Corriente" },
          { subject: "Estado de Cuenta Tarjeta" },
        ],
      });
      void query;
      const uids: number[] = Array.isArray(uidsRaw) ? uidsRaw : [];
      const list = uids
        .filter((uid: number) => (opts.sinceUid ? uid > opts.sinceUid : true))
        .sort((a: number, b: number) => a - b);
      const slice = list.slice(-(opts.limit ?? 100));

      for (const uid of slice) {
        const downloaded = await client.download(uid);
        if (!downloaded?.content) continue;
        const parsed = await simpleParser(downloaded.content);
        const from = parsed.from?.text ?? "";
        const subject = parsed.subject ?? "";
        const textParts: string[] = [];
        if (parsed.text) textParts.push(parsed.text);
        if (parsed.html) textParts.push(String(parsed.html));

        const attachmentTexts: FetchedMail["attachmentTexts"] = [];
        for (const att of parsed.attachments ?? []) {
          const name = att.filename ?? "attachment";
          if (!/\.pdf$/i.test(name) && att.contentType !== "application/pdf") continue;
          const extracted = extractPdfText(att.content, cfg.pdfPassword);
          if (extracted) attachmentTexts.push({ filename: name, text: extracted });
        }

        out.push({
          uid,
          messageId: parsed.messageId ?? `uid:${uid}`,
          subject,
          from,
          date: parsed.date ? parsed.date.toISOString() : null,
          text: textParts.join("\n"),
          attachmentTexts,
        });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return out;
}

function extractPdfText(buf: Buffer, password?: string): string | null {
  const dir = mkdtempSync(join(tmpdir(), "cc-pdf-"));
  const pdfPath = join(dir, "doc.pdf");
  const outPath = join(dir, "out.txt");
  try {
    writeFileSync(pdfPath, buf);
    const py = `
from pypdf import PdfReader
import sys
path, out, pwd = sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv)>3 else ''
r = PdfReader(path)
if r.is_encrypted:
    if not pwd:
        open(out,'w').write('')
        raise SystemExit(0)
    r.decrypt(pwd)
text = '\\n'.join((p.extract_text() or '') for p in r.pages)
open(out,'w',encoding='utf-8').write(text)
`;
    const args = ["-c", py, pdfPath, outPath];
    if (password) args.push(password);
    const res = spawnSync("python3", args, { encoding: "utf-8" });
    if (res.status !== 0) return null;
    const text = readFileSync(outPath, "utf-8");
    return text.trim() ? text : null;
  } catch {
    return null;
  } finally {
    try {
      unlinkSync(pdfPath);
      unlinkSync(outPath);
    } catch {
      /* ignore */
    }
  }
}
