import { defineSchedule } from "@grok/agent-sdk/schedules";

/**
 * Always-on mailbox poll. On Cursor hosting / production `serve` (not --dev),
 * this fires every 15 minutes: sync Gmail → update kv → refresh HTML dashboard.
 */
export default defineSchedule({
  cron: "*/15 * * * *",
  async run({ callTool }) {
    await callTool("sync_gmail", { limit: 30, fullHistory: false });
    // sync_gmail already publishes the dashboard; call again as a safety net
    // if sync returned missing_gmail_secrets or failed mid-way after partial writes.
    await callTool("render_dashboard", {});
  },
});
