import { defineArtifacts } from "@grok/agent-sdk/artifacts";
import * as z from "zod/v4";

export default defineArtifacts({
  agentTool: false,
  kinds: {
    "spend-dashboard": {
      description: "HTML dashboard of Banco de Chile spend, regenerated after each Gmail sync.",
      schema: z.object({
        generatedAt: z.string(),
        transactionCount: z.number(),
        lastSyncAt: z.string().nullable(),
      }),
    },
  },
});
