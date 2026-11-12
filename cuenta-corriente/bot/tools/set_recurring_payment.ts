import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { normalizeMerchant } from "../lib/categories.js";
import { publishDashboard } from "../lib/publish-dashboard.js";
import {
  loadRecurringPayments,
  recurringId,
  saveRecurringPayments,
  type RecurringPayment,
} from "../lib/recurring.js";

export default defineTool({
  description: prompt`
    Confirma, edita o quita un pago recurrente del mes (arriendo, luz, gimnasio,
    suscripciones...). "match" es el texto del comercio o glosa tal como aparece
    en los movimientos (ej. "ENEL", "POWER FITNESS", "PAC FUNDACION COANIQUEM").
    Regenera el dashboard HTML al terminar.
  `,
  execution: "server",
  effect: "idempotent",
  inputSchema: z.object({
    action: z.enum(["upsert", "remove"]),
    match: z.string().min(2).describe("Texto del comercio/glosa a buscar en los movimientos."),
    name: z.string().optional().describe("Nombre para mostrar (default: match)."),
    dueDay: z.number().int().min(1).max(31).optional().describe("Día del mes en que vence."),
    expectedAmount: z.number().positive().optional().describe("Monto esperado en CLP."),
  }),
  async execute(input, ctx) {
    const items = await loadRecurringPayments(ctx.host.kv);
    const id = recurringId(input.match);
    const rest = items.filter((item) => item.id !== id);

    const prev = items.find((item) => item.id === id);
    // Removed entries stay stored as dismissed so the suggestion does not come back.
    const saved: RecurringPayment = {
      id,
      name: input.name ?? prev?.name ?? input.match,
      match: normalizeMerchant(input.match),
      dueDay: input.dueDay ?? prev?.dueDay,
      expectedAmount: input.expectedAmount ?? prev?.expectedAmount,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      ...(input.action === "remove" ? { dismissed: true } : {}),
    };
    rest.push(saved);

    await saveRecurringPayments(ctx.host.kv, rest);
    const dashboard = await publishDashboard({
      kv: ctx.host.kv,
      files: ctx.host.files,
      artifacts: ctx.artifacts,
    });
    return {
      ok: true,
      action: input.action,
      saved,
      active: rest.filter((item) => !item.dismissed).length,
      dashboard: dashboard.path,
    };
  },
});
