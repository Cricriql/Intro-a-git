import { formatClp } from "./money.js";
import type { GmailSyncState } from "./store.js";
import type { StoredTransaction } from "./types.js";

export type DashboardData = {
  generatedAt: string;
  timezoneLabel: string;
  sync: GmailSyncState;
  transactions: StoredTransaction[];
  learnedMerchants: number;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildDashboardHtml(data: DashboardData): string {
  const txs = data.transactions;
  const byCategory = new Map<string, { count: number; total: number }>();
  let spend = 0;
  let income = 0;
  let confirmed = 0;
  let uncategorized = 0;

  for (const tx of txs) {
    if (tx.amount < 0) spend += tx.amount;
    else income += tx.amount;
    if (tx.category) confirmed += 1;
    else uncategorized += 1;
    const cat = tx.category ?? tx.proposedCategory ?? "sin_categoria";
    const b = byCategory.get(cat) ?? { count: 0, total: 0 };
    b.count += 1;
    b.total += tx.amount;
    byCategory.set(cat, b);
  }

  const categories = [...byCategory.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => a.total - b.total);

  const recent = [...txs]
    .filter((t) => t.amount < 0)
    .sort((a, b) => dateKey(b.date) - dateKey(a.date))
    .slice(0, 25);

  const catRows = categories
    .map(
      (c) => `<tr>
      <td>${escapeHtml(c.category)}</td>
      <td class="num">${c.count}</td>
      <td class="num">${escapeHtml(formatClp(c.total))}</td>
    </tr>`,
    )
    .join("\n");

  const txRows = recent
    .map(
      (t) => `<tr>
      <td>${escapeHtml(t.date)}${t.time ? " " + escapeHtml(t.time) : ""}</td>
      <td>${escapeHtml(t.merchant || t.description)}</td>
      <td>${escapeHtml(t.source)}</td>
      <td>${escapeHtml(t.category ?? t.proposedCategory ?? "—")}</td>
      <td class="num">${escapeHtml(formatClp(t.amount))}</td>
    </tr>`,
    )
    .join("\n");

  const lastSync = data.sync.lastSyncAt
    ? new Date(data.sync.lastSyncAt).toLocaleString("es-CL", {
        timeZone: "America/Santiago",
      })
    : "nunca";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta http-equiv="refresh" content="900" />
  <title>cuenta-corriente — estado</title>
  <style>
    :root {
      --bg: #f3efe6;
      --ink: #1c1a16;
      --muted: #5c574e;
      --line: #d4cdc0;
      --card: #fffdf8;
      --accent: #0f5c4c;
      --warn: #8a4b12;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        radial-gradient(ellipse at top left, #e7f0ec 0%, transparent 45%),
        linear-gradient(180deg, #f7f3ea 0%, var(--bg) 40%, #ebe4d6 100%);
      min-height: 100vh;
    }
    main {
      max-width: 960px;
      margin: 0 auto;
      padding: 2rem 1.25rem 3rem;
    }
    h1 {
      font-family: "Fraunces", Georgia, serif;
      font-weight: 600;
      font-size: clamp(1.8rem, 4vw, 2.4rem);
      margin: 0 0 0.35rem;
      letter-spacing: -0.02em;
    }
    .sub { color: var(--muted); margin: 0 0 1.5rem; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1.5rem;
    }
    .stat {
      background: var(--card);
      border: 1px solid var(--line);
      padding: 1rem;
    }
    .stat .label { font-size: 0.78rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
    .stat .value { font-size: 1.35rem; font-weight: 600; margin-top: 0.35rem; color: var(--accent); }
    section {
      background: var(--card);
      border: 1px solid var(--line);
      padding: 1rem 1.1rem 1.25rem;
      margin-bottom: 1rem;
    }
    h2 { font-size: 1.05rem; margin: 0 0 0.75rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th, td { text-align: left; padding: 0.45rem 0.35rem; border-bottom: 1px solid var(--line); vertical-align: top; }
    th { color: var(--muted); font-weight: 500; font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .meta { font-size: 0.85rem; color: var(--muted); }
    .badge {
      display: inline-block;
      border: 1px solid var(--line);
      padding: 0.15rem 0.5rem;
      font-size: 0.78rem;
      color: var(--warn);
      background: #fff7ec;
    }
  </style>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
</head>
<body>
  <main>
    <h1>cuenta-corriente</h1>
    <p class="sub">Estado de gastos Banco de Chile · se actualiza con cada sync de correo</p>
    <p class="meta">Generado: ${escapeHtml(
      new Date(data.generatedAt).toLocaleString("es-CL", { timeZone: "America/Santiago" }),
    )} (America/Santiago) · Último sync Gmail: <strong>${escapeHtml(lastSync)}</strong>
      · Mails vistos: ${data.sync.seenMessageIds.length}
      · <span class="badge">auto-refresh 15 min</span>
    </p>

    <div class="grid">
      <div class="stat"><div class="label">Movimientos</div><div class="value">${txs.length}</div></div>
      <div class="stat"><div class="label">Gastado (cargos)</div><div class="value">${escapeHtml(formatClp(Math.abs(spend)))}</div></div>
      <div class="stat"><div class="label">Ingresos / abonos</div><div class="value">${escapeHtml(formatClp(income))}</div></div>
      <div class="stat"><div class="label">Categorizados</div><div class="value">${confirmed}</div></div>
      <div class="stat"><div class="label">Sin categoría</div><div class="value">${uncategorized}</div></div>
      <div class="stat"><div class="label">Comercios aprendidos</div><div class="value">${data.learnedMerchants}</div></div>
    </div>

    <section>
      <h2>Por categoría</h2>
      <table>
        <thead><tr><th>Categoría</th><th class="num">N°</th><th class="num">Total</th></tr></thead>
        <tbody>
          ${catRows || '<tr><td colspan="3">Sin datos aún. Espera el sync o pregunta al agente.</td></tr>'}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Últimos cargos</h2>
      <table>
        <thead><tr><th>Fecha</th><th>Comercio</th><th>Fuente</th><th>Categoría</th><th class="num">Monto</th></tr></thead>
        <tbody>
          ${txRows || '<tr><td colspan="5">Sin cargos en memoria.</td></tr>'}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

function dateKey(date: string): number {
  const m = /^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/.exec(date);
  if (!m) {
    const iso = Date.parse(date);
    return Number.isFinite(iso) ? iso : 0;
  }
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : 2026;
  if (year < 100) year += 2000;
  return year * 10_000 + month * 100 + day;
}
