import { splitAccounts, sumAmount } from "./accounts.js";
import { formatYmd, monthKey, monthLabel, todayInSantiago, type YMD } from "./dates.js";
import { formatClp } from "./money.js";
import { monthlyBreakdown, type DatedTx, type MonthBreakdown } from "./monthly.js";
import { buildChecklist, type ChecklistItem, type RecurringPayment } from "./recurring.js";
import type { GmailSyncState } from "./store.js";
import type { StoredTransaction } from "./types.js";

export type DashboardData = {
  generatedAt: string;
  timezoneLabel: string;
  sync: GmailSyncState;
  transactions: StoredTransaction[];
  learnedMerchants: number;
  recurring: RecurringPayment[];
  today?: YMD;
};

const MONTHS_SHOWN = 6;

const CATEGORY_COLORS: Record<string, string> = {
  comida: "#c8553d",
  supermercado: "#0f5c4c",
  transporte: "#3d6fb0",
  suscripciones: "#7a4fa3",
  transferencias: "#8a8172",
  salud: "#2f9c8f",
  fitness: "#d98b2b",
  donaciones: "#b84f7d",
  servicios: "#4f7f3a",
  entretenimiento: "#e0b23b",
  vivienda: "#6b4a2f",
  ingresos: "#5aa469",
  bancario: "#454b55",
  otros: "#a89f8f",
  sin_categoria: "#cfc6b6",
};

function colorFor(category: string): string {
  return CATEGORY_COLORS[category] ?? "#9c9384";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pieSvg(month: MonthBreakdown): string {
  if (month.total <= 0) return "";
  const r = 1;
  let angle = -Math.PI / 2;
  const slices = month.categories.map((c) => {
    const fraction = c.total / month.total;
    const title = `<title>${escapeHtml(c.category)}: ${escapeHtml(formatClp(c.total))} (${Math.round(fraction * 100)}%)</title>`;
    if (fraction >= 0.9999) {
      return `<circle cx="0" cy="0" r="${r}" fill="${colorFor(c.category)}">${title}</circle>`;
    }
    const start = angle;
    angle += fraction * Math.PI * 2;
    const x1 = Math.cos(start) * r;
    const y1 = Math.sin(start) * r;
    const x2 = Math.cos(angle) * r;
    const y2 = Math.sin(angle) * r;
    const large = fraction > 0.5 ? 1 : 0;
    return `<path d="M0 0 L${x1.toFixed(4)} ${y1.toFixed(4)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(4)} ${y2.toFixed(4)} Z" fill="${colorFor(c.category)}">${title}</path>`;
  });
  return `<svg class="pie" viewBox="-1.05 -1.05 2.1 2.1" role="img" aria-label="Gasto por categoría ${escapeHtml(monthLabel(month.month))}">${slices.join("")}</svg>`;
}

function monthCard(
  month: MonthBreakdown,
  isCurrent: boolean,
  buckets: { corriente: number; facturada: number; noFacturada: number },
): string {
  const legend = month.categories
    .map(
      (c) => `<li>
        <span class="dot" style="background:${colorFor(c.category)}"></span>
        <span class="lname">${escapeHtml(c.category)}</span>
        <span class="lpct">${Math.round((c.total / month.total) * 100)}%</span>
        <span class="lamt">${escapeHtml(formatClp(c.total))}</span>
      </li>`,
    )
    .join("");
  return `<div class="month">
    <div class="mhead">
      <span class="mname">${escapeHtml(monthLabel(month.month))}${isCurrent ? ' <span class="badge">en curso</span>' : ""}</span>
      <span class="mtotal">${escapeHtml(formatClp(month.total))}</span>
    </div>
    <div class="mbody">
      ${pieSvg(month)}
      <ul class="legend">${legend}</ul>
    </div>
    <div class="buckets">
      <span><i class="corriente"></i>Cuenta ${escapeHtml(formatClp(buckets.corriente))}</span>
      <span><i class="facturada"></i>Facturada ${escapeHtml(formatClp(buckets.facturada))}</span>
      <span><i class="nofact"></i>No facturada ${escapeHtml(formatClp(buckets.noFacturada))}</span>
    </div>
    <div class="meta">${month.count} cargos</div>
  </div>`;
}

function topCategories(list: DatedTx[], n = 4): string {
  const map = new Map<string, number>();
  for (const tx of list) {
    map.set(tx.effectiveCategory, (map.get(tx.effectiveCategory) ?? 0) + Math.abs(tx.amount));
  }
  const ranked = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  if (!ranked.length) return "";
  return `<ul class="legend">${ranked
    .map(
      ([category, total]) => `<li>
        <span class="dot" style="background:${colorFor(category)}"></span>
        <span class="lname">${escapeHtml(category)}</span>
        <span class="lamt">${escapeHtml(formatClp(total))}</span>
      </li>`,
    )
    .join("")}</ul>`;
}

function miniRows(list: DatedTx[]): string {
  const rows = list
    .slice(0, 5)
    .map(
      (tx) => `<tr>
        <td>${escapeHtml(tx.date)}</td>
        <td>${escapeHtml(tx.merchant || tx.description)}</td>
        <td class="num">${escapeHtml(formatClp(tx.amount))}</td>
      </tr>`,
    )
    .join("");
  if (!rows) return `<p class="meta">Sin movimientos en este período.</p>`;
  return `<table><tbody>${rows}</tbody></table>`;
}

function whereLabel(tx: DatedTx): string {
  if (tx.source === "cartola") return "Cuenta corriente";
  if (tx.source === "visa") return "Tarjeta facturada";
  return "Tarjeta no facturada";
}

const STATUS_LABEL: Record<ChecklistItem["status"], string> = {
  pagado: "Pagado",
  pendiente: "Pendiente",
  atrasado: "Atrasado",
};

function checklistRow(item: ChecklistItem): string {
  const last = item.paid[item.paid.length - 1];
  const amount = item.paid.length
    ? formatClp(item.paidTotal)
    : item.expectedAmount
      ? `~${formatClp(item.expectedAmount)}`
      : "—";
  return `<tr>
    <td>${escapeHtml(item.name)}${item.suggested ? ' <span class="tag">sugerido</span>' : ""}</td>
    <td><span class="status ${item.status}">${STATUS_LABEL[item.status]}</span></td>
    <td class="wide-only">${last ? escapeHtml(last.date) : "—"}</td>
    <td class="wide-only">${item.dueDay ? `día ${item.dueDay}` : "—"}</td>
    <td class="num">${escapeHtml(amount)}</td>
  </tr>`;
}

export function buildDashboardHtml(data: DashboardData): string {
  const txs = data.transactions;
  const today = data.today ?? todayInSantiago(new Date(data.generatedAt));
  const currentMonth = monthKey(today);

  const view = splitAccounts(txs, today);
  const spend = [
    ...view.corriente,
    ...view.facturada,
    ...view.facturadaOlder,
    ...view.noFacturada,
  ];
  const months = monthlyBreakdown(spend);
  const shownMonths = months.slice(0, MONTHS_SHOWN);
  const bucketsFor = (month: string) => {
    const of = (list: DatedTx[]) => sumAmount(list.filter((tx) => tx.month === month));
    return {
      corriente: of(view.corriente),
      facturada: of([...view.facturada, ...view.facturadaOlder]),
      noFacturada: of(view.noFacturada),
    };
  };

  const corrienteMonths = [...new Set(view.corriente.map((tx) => tx.month))].sort();
  const corrienteMonth = corrienteMonths.includes(currentMonth)
    ? currentMonth
    : (corrienteMonths.at(-1) ?? currentMonth);
  const corrienteShown = view.corriente.filter((tx) => tx.month === corrienteMonth);
  const facturadaTotal = sumAmount(view.facturada);
  const noFacturadaTotal = sumAmount(view.noFacturada);
  const compareTotal = sumAmount(corrienteShown) + facturadaTotal + noFacturadaTotal;
  const share = (n: number) => (compareTotal > 0 ? Math.max(0, (n / compareTotal) * 100) : 0);

  const noFacturadaByMonth = [...new Set(view.noFacturada.map((tx) => tx.month))]
    .sort()
    .map((month) => `${monthLabel(month)} ${formatClp(sumAmount(view.noFacturada.filter((tx) => tx.month === month)))}`);

  const lastPayDate = view.cardPayments[0]?.date;
  const lastPayTotal = lastPayDate
    ? sumAmount(view.cardPayments.filter((tx) => tx.date === lastPayDate))
    : 0;

  const checklist = buildChecklist(txs, data.recurring, today, currentMonth);
  const pendingCount = checklist.items.filter((i) => i.status !== "pagado" && !i.suggested).length;
  const suggestedPending = checklist.items.filter((i) => i.status !== "pagado" && i.suggested).length;

  let confirmed = 0;
  let uncategorized = 0;
  for (const tx of txs) {
    if (tx.category) confirmed += 1;
    else uncategorized += 1;
  }

  const byCategory = new Map<string, { count: number; total: number }>();
  for (const tx of spend) {
    const b = byCategory.get(tx.effectiveCategory) ?? { count: 0, total: 0 };
    b.count += 1;
    b.total += Math.abs(tx.amount);
    byCategory.set(tx.effectiveCategory, b);
  }
  const catRows = [...byCategory.entries()]
    .sort((a, b) => b[1].total - a[1].total)
    .map(
      ([category, v]) => `<tr>
      <td><span class="dot" style="background:${colorFor(category)}"></span>${escapeHtml(category)}</td>
      <td class="num">${v.count}</td>
      <td class="num">${escapeHtml(formatClp(v.total))}</td>
    </tr>`,
    )
    .join("\n");

  const recent = [...spend]
    .sort((a, b) => b.month.localeCompare(a.month) || b.ymd.day - a.ymd.day)
    .slice(0, 25);
  const txRows = recent
    .map(
      (t) => `<tr>
      <td>${escapeHtml(t.date)}${t.time ? " " + escapeHtml(t.time) : ""}</td>
      <td>${escapeHtml(t.merchant || t.description)}</td>
      <td>${escapeHtml(whereLabel(t))}</td>
      <td>${escapeHtml(t.effectiveCategory)}</td>
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
      --bad: #a3321f;
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
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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
    .stat .value.warn { color: var(--warn); }
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
    .tag {
      font-size: 0.72rem;
      color: var(--muted);
      border: 1px dashed var(--line);
      padding: 0.05rem 0.35rem;
      margin-left: 0.25rem;
    }
    .status {
      display: inline-block;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border: 1px solid currentColor;
    }
    .status.pagado { color: var(--accent); background: #e9f3ef; }
    .status.pendiente { color: var(--warn); background: #fff7ec; }
    .status.atrasado { color: var(--bad); background: #fbebe7; }
    .dot {
      display: inline-block;
      width: 0.7rem;
      height: 0.7rem;
      border-radius: 50%;
      margin-right: 0.45rem;
      vertical-align: -0.05rem;
    }
    .months {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 400px), 1fr));
      gap: 0.75rem;
    }
    .month { border: 1px solid var(--line); padding: 0.85rem; background: #fffefb; }
    .mhead { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; margin-bottom: 0.6rem; }
    .mname { font-weight: 600; text-transform: capitalize; }
    .mtotal { font-weight: 600; color: var(--accent); font-variant-numeric: tabular-nums; }
    .mbody { display: flex; flex-wrap: wrap; gap: 0.85rem; align-items: center; }
    .pie { width: 120px; height: 120px; flex: none; }
    .pie path, .pie circle { stroke: #fffdf8; stroke-width: 0.02; }
    .legend { list-style: none; margin: 0; padding: 0; flex: 1 1 220px; font-size: 0.82rem; min-width: 0; }
    .legend li { display: flex; align-items: center; gap: 0.4rem; padding: 0.12rem 0; }
    .legend .dot { margin-right: 0; flex: none; }
    .lname { flex: 1; min-width: 5rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .lpct { color: var(--muted); font-variant-numeric: tabular-nums; min-width: 2.2rem; text-align: right; }
    .lamt { font-variant-numeric: tabular-nums; min-width: 5rem; text-align: right; }
    .stat .hint { font-size: 0.75rem; color: var(--muted); margin-top: 0.2rem; }
    .splitbar { display: flex; height: 12px; margin: 0 0 0.75rem; background: var(--line); }
    .splitbar span { display: block; height: 100%; }
    .splitbar .corriente, .buckets .corriente { background: #0f5c4c; }
    .splitbar .facturada, .buckets .facturada { background: #3d6fb0; }
    .splitbar .nofact, .buckets .nofact { background: #c8553d; }
    .accounts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .account {
      background: var(--card);
      border: 1px solid var(--line);
      border-top: 4px solid #0f5c4c;
      padding: 0.9rem 1rem 0.4rem;
      min-width: 0;
    }
    .account.facturada { border-top-color: #3d6fb0; }
    .account.nofact { border-top-color: #c8553d; }
    .account h2 { margin: 0; }
    .account .adesc { margin: 0.25rem 0 0; }
    .account .avalue { font-size: 1.55rem; font-weight: 600; margin: 0.45rem 0 0.1rem; font-variant-numeric: tabular-nums; }
    .account.corriente .avalue { color: #0f5c4c; }
    .account.facturada .avalue { color: #3d6fb0; }
    .account.nofact .avalue { color: #c8553d; }
    .account .aperiod { font-weight: 600; margin: 0 0 0.45rem; }
    .account table { font-size: 0.82rem; margin-top: 0.4rem; }
    .buckets { display: flex; flex-wrap: wrap; gap: 0.35rem 0.8rem; margin-top: 0.7rem; font-size: 0.78rem; color: var(--muted); }
    .buckets i { display: inline-block; width: 0.55rem; height: 0.55rem; border-radius: 50%; margin-right: 0.3rem; }
    @media (max-width: 560px) {
      .wide-only { display: none; }
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

    <div class="splitbar" role="img" aria-label="Proporción entre cuenta corriente, tarjeta facturada y tarjeta no facturada">
      <span class="corriente" style="width:${share(sumAmount(corrienteShown)).toFixed(1)}%"></span>
      <span class="facturada" style="width:${share(facturadaTotal).toFixed(1)}%"></span>
      <span class="nofact" style="width:${share(noFacturadaTotal).toFixed(1)}%"></span>
    </div>
    <div class="accounts">
      <article class="account corriente">
        <h2>Cuenta corriente</h2>
        <p class="adesc meta">Dinero que salió de la cuenta. No incluye el pago de la tarjeta ni el sueldo.</p>
        <div class="avalue">${escapeHtml(formatClp(sumAmount(corrienteShown)))}</div>
        <p class="aperiod">${escapeHtml(monthLabel(corrienteMonth).replace(/^./, (c) => c.toUpperCase()))}</p>
        ${
          corrienteMonth === currentMonth
            ? ""
            : `<p class="meta">${escapeHtml(monthLabel(currentMonth))}: la cartola de este mes todavía no llega.</p>`
        }
        ${topCategories(corrienteShown)}
        ${miniRows(corrienteShown)}
      </article>
      <article class="account facturada">
        <h2>Tarjeta facturada</h2>
        <p class="adesc meta">Compras que ya aparecen en el estado de cuenta Visa.</p>
        <div class="avalue">${escapeHtml(formatClp(facturadaTotal))}</div>
        <p class="aperiod">${
          view.statementFrom && view.statementTo
            ? `${escapeHtml(formatYmd(view.statementFrom))} – ${escapeHtml(formatYmd(view.statementTo))}`
            : "Sin estado de cuenta todavía"
        }</p>
        ${
          lastPayDate
            ? `<p class="meta">Pagada desde la cuenta: ${escapeHtml(formatClp(lastPayTotal))} el ${escapeHtml(lastPayDate)}.${
                lastPayTotal > facturadaTotal
                  ? " El pago incluye el saldo anterior del estado de cuenta."
                  : ""
              }</p>`
            : `<p class="meta">Todavía no hay un pago de la tarjeta en la cartola.</p>`
        }
        ${topCategories(view.facturada)}
        ${miniRows(view.facturada)}
      </article>
      <article class="account nofact">
        <h2>Tarjeta no facturada</h2>
        <p class="adesc meta">Compras con tarjeta posteriores al último estado de cuenta. Van a salir en el próximo.</p>
        <div class="avalue">${escapeHtml(formatClp(noFacturadaTotal))}</div>
        <p class="aperiod">${
          view.statementTo
            ? `${view.noFacturada.length} compras después del ${escapeHtml(formatYmd(view.statementTo))}`
            : `${view.noFacturada.length} compras, sin estado de cuenta de referencia`
        }</p>
        ${
          noFacturadaByMonth.length
            ? `<p class="meta">${escapeHtml(noFacturadaByMonth.join(" · "))}</p>`
            : ""
        }
        ${topCategories(view.noFacturada)}
        ${miniRows(view.noFacturada)}
      </article>
    </div>

    <div class="grid">
      <div class="stat"><div class="label">Pagos pendientes</div><div class="value${pendingCount ? " warn" : ""}">${pendingCount}</div>${
        suggestedPending ? `<div class="hint">+${suggestedPending} sugeridos</div>` : ""
      }</div>
      <div class="stat"><div class="label">Movimientos</div><div class="value">${txs.length}</div></div>
      <div class="stat"><div class="label">Categorizados</div><div class="value">${confirmed}</div></div>
      <div class="stat"><div class="label">Sin categoría</div><div class="value">${uncategorized}</div></div>
    </div>

    <section>
      <h2>Pagos de ${escapeHtml(monthLabel(currentMonth))}</h2>
      <table>
        <thead><tr><th>Pago</th><th>Estado</th><th class="wide-only">Fecha</th><th class="wide-only">Vence</th><th class="num">Monto</th></tr></thead>
        <tbody>
          ${checklist.items.map(checklistRow).join("\n")}
        </tbody>
      </table>
      <p class="meta">Los pagos desde la cuenta corriente aparecen cuando llega la cartola; las compras con tarjeta, apenas llega el aviso.
        Los <em>sugeridos</em> se repitieron en meses anteriores: pídele al agente que los confirme, les ponga día de vencimiento o los quite.</p>
    </section>

    <section>
      <h2>Gasto por mes y categoría</h2>
      ${
        shownMonths.length
          ? `<div class="months">${shownMonths.map((m) => monthCard(m, m.month === currentMonth, bucketsFor(m.month))).join("\n")}</div>`
          : '<p class="meta">Sin gastos aún. Espera el sync o pregunta al agente.</p>'
      }
      <p class="meta">Cada mes separa lo que salió de la cuenta, lo que ya está en un estado de cuenta Visa y lo que solo llegó como aviso de compra.
        Una compra no se cuenta dos veces. Comercios aprendidos: ${data.learnedMerchants}.</p>
    </section>

    <section>
      <h2>Por categoría (todo el histórico)</h2>
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
        <thead><tr><th>Fecha</th><th>Comercio</th><th>Dónde</th><th>Categoría</th><th class="num">Monto</th></tr></thead>
        <tbody>
          ${txRows || '<tr><td colspan="5">Sin cargos en memoria.</td></tr>'}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}
