# cuenta-corriente

Agent SDK bot that categorizes Banco de Chile **cartola** (cuenta corriente), **Visa EECC**, and purchase-alert email text; learns merchant→category mappings; and runs weekly spend tracking (cadence is changeable).

## Surfaces (v1)

- Playground + HTTP (`agent-sdk dev` / `serve`)
- Weekly markdown schedule (`bot/schedules/weekly-review.md`, Mondays 13:00 UTC)
- Builtin conversation reminders (`builtinTools.reminders`)
- No Slack yet
- Gmail OAuth later for `christian.arriagada12@gmail.com` (paste/upload text in v1)

## Privacy

- Do **not** commit raw PDFs, EMLs, full account/card numbers, transfer counterparty names, or the PDF unlock password.
- Put the PDF password only in a secret / env such as `STATEMENT_PDF_PASSWORD` if a future extractor needs it. Prefer redacted text fixtures under `bot/sandbox/workspace/fixtures/`.

## Quick start

```bash
cd cuenta-corriente
npm install
npx --yes "@grok/agent-sdk@0.5.0" validate --dir .
npx tsc --noEmit -p .
npx --yes "@grok/agent-sdk@0.5.0" tool call get_tracking_preference --dir . --input '{}' --json
npx --yes "@grok/agent-sdk@0.5.0" tool call parse_statement --dir . --input '{"text":"D01/09 PAGO:JUMBO CENTRAL 38.000"}' --json
```

Model turns need a Cursor credential:

```bash
npx --yes "@grok/agent-sdk@0.5.0" login
npx --yes "@grok/agent-sdk@0.5.0" run --dir . --message "Pegaré una cartola; primero dime la cadencia de seguimiento."
npx --yes "@grok/agent-sdk@0.5.0" serve --dir . --mode single --dev
# http://127.0.0.1:3000/playground
```

## Tools

`parse_statement`, `list_transactions`, `set_category`, `category_summary`, `get_tracking_preference`, `set_tracking_preference`.
