import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { getTrackingPreference } from "../lib/store.js";

export default defineTool({
  description:
    "Read the spend-tracking cadence preference (weekly default, or daily / biweekly / uncategorized_only).",
  execution: "server",
  effect: "read",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const preference = await getTrackingPreference(ctx.host.kv);
    return {
      cadence: preference.cadence,
      updatedAt: preference.updatedAt,
      defaultCadence: "weekly",
      allowed: ["weekly", "daily", "biweekly", "uncategorized_only"],
    };
  },
});
