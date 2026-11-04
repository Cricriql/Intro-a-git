import { prompt } from "@grok/agent-sdk";
import { defineTool } from "@grok/agent-sdk/tools";
import * as z from "zod/v4";
import { publishDashboard } from "../lib/publish-dashboard.js";

export default defineTool({
  description: prompt`
    Rebuild the HTML spend dashboard from durable memory and publish it as a
    tagged artifact (spend-dashboard) plus host file dashboard/estado.html.
    Call after sync_gmail or when the user asks for the HTML/estado visual.
  `,
  execution: "server",
  effect: "idempotent",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const published = await publishDashboard({
      kv: ctx.host.kv,
      files: ctx.host.files,
      artifacts: ctx.artifacts,
    });
    return {
      ok: true,
      ...published,
      howToView:
        "Artifact spend-dashboard: GET /<slug>/v1/artifacts/:id/content — o archivo deployment dashboard/estado.html.",
    };
  },
});
