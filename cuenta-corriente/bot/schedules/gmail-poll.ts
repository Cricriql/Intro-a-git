import { defineSchedule } from "@grok/agent-sdk/schedules";

/** Poll Gmail every 15 minutes for new Banco de Chile purchase alerts / statements. */
export default defineSchedule({
  cron: "*/15 * * * *",
  async run({ callTool }) {
    await callTool("sync_gmail", { limit: 30, fullHistory: false });
  },
});
