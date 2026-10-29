import { defineAgent } from "@grok/agent-sdk";

export default defineAgent({
  model: {
    id: "grok-4.7",
    params: [
      { id: "reasoning_effort", value: "high" },
      { id: "fast", value: "true" },
    ],
  },
  builtinTools: { reminders: true },
  hosting: {
    egressDomains: ["imap.gmail.com", "gmail.com", "googleapis.com", "oauth2.googleapis.com"],
    secretNames: ["GMAIL_USER", "GMAIL_APP_PASSWORD", "STATEMENT_PDF_PASSWORD"],
  },
});
