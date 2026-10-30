import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { setTrackingPreference } from "../lib/store.js";

export default defineTool({
  description:
    "Change spend-tracking cadence: weekly (default), daily, biweekly, or uncategorized_only. Pair with builtin reminders when the user wants a different wake cadence in-chat.",
  execution: "server",
  effect: "idempotent",
  inputSchema: z.object({
    cadence: z.enum(["weekly", "daily", "biweekly", "uncategorized_only"]),
  }),
  async execute({ cadence }, ctx) {
    const preference = await setTrackingPreference(ctx.host.kv, cadence);
    return {
      ok: true,
      cadence: preference.cadence,
      updatedAt: preference.updatedAt,
      hint:
        cadence === "weekly"
          ? "El schedule semanal del agente sigue activo. Usa reminders_create si quieres un recordatorio adicional en esta conversación."
          : "Preferencia guardada. Usa reminders_create/reminders_cancel para alinear el recordatorio de esta conversación con la nueva cadencia.",
    };
  },
});
