import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { monthKey, monthLabel, todayInSantiago } from "../lib/dates.js";
import { formatClp } from "../lib/money.js";
import { buildChecklist, loadRecurringPayments } from "../lib/recurring.js";
import { loadTransactions } from "../lib/store.js";

export default defineTool({
  description: prompt`
    Lista de pagos del mes: pago de tarjeta de crédito, pagos recurrentes
    confirmados (set_recurring_payment) y sugeridos (comercios que se repiten),
    con estado pagado / pendiente / atrasado. Úsalo cuando pregunten
    "¿qué me falta pagar?", "¿pagué la tarjeta?" o por cuentas del mes.
  `,
  execution: "server",
  effect: "read",
  inputSchema: z.object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
      .describe("Mes YYYY-MM (default: mes actual en Santiago)."),
  }),
  async execute(input, ctx) {
    const today = todayInSantiago();
    const month = input.month ?? monthKey(today);
    const checklist = buildChecklist(
      await loadTransactions(ctx.host.kv),
      await loadRecurringPayments(ctx.host.kv),
      today,
      month,
    );
    return {
      month,
      monthLabel: monthLabel(month),
      items: checklist.items.map((item) => ({
        id: item.id,
        name: item.name,
        match: item.match,
        suggested: item.suggested,
        status: item.status,
        dueDay: item.dueDay,
        expectedAmountFormatted: item.expectedAmount ? formatClp(item.expectedAmount) : null,
        paidTotalFormatted: item.paid.length ? formatClp(item.paidTotal) : null,
        paid: item.paid,
      })),
      note: "Los pagos desde la cuenta corriente solo aparecen cuando llega la cartola mensual.",
    };
  },
});
