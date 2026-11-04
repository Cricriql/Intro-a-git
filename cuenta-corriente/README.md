# cuenta-corriente

Agente always-on de gastos Banco de Chile: revisa Gmail cada **15 minutos**, actualiza la memoria y regenera un **HTML de estado**.

## Qué hace (flujo)

```
Gmail (IMAP solo lectura)
   │  cada 15 min → schedule gmail-poll
   ▼
sync_gmail  → parsea avisos / cartola / EECC
   │
   ├─ host.kv (movimientos + categorías aprendidas)
   └─ HTML dashboard
         ├─ artifact "spend-dashboard"
         └─ host.files: dashboard/estado.html
```

También puedes preguntarle en el playground: *“estado de la cuenta”*, *“sincroniza”*, *“regenera el HTML”*.

## Dejarlo siempre activo

`--dev` **no** dispara el cron solo. Para que corra cada 15 min necesitas una de estas:

### A) Deploy en Cursor (recomendado)

1. Configura secretos en el deployment: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `STATEMENT_PDF_PASSWORD`.
2. Desde tu máquina (con cuenta/service account):

```bash
cd cuenta-corriente
npx --yes "@grok/agent-sdk@0.5.0" validate --dir .
npx --yes "@grok/agent-sdk@0.5.0" deploy --dir . --dry-run
npx --yes "@grok/agent-sdk@0.5.0" deploy --dir .
```

3. Gestiona el agente en https://cursor.com/dashboard/deployed-agents  
4. El schedule `gmail-poll` queda activo en hosting; el HTML se actualiza solo.

### B) Servidor propio 24/7

```bash
cd cuenta-corriente
# .env.local con los 3 secretos
npx --yes "@grok/agent-sdk@0.5.0" serve --dir . --mode single
# sin --dev → los cron sí disparan
```

### C) Solo desarrollo

```bash
npx --yes "@grok/agent-sdk@0.5.0" serve --dir . --mode single --dev
# forzar poll:
curl -X POST http://127.0.0.1:3000/cuenta-corriente/v1/dev/schedules/gmail-poll
```

## Secretos

| Secreto | Uso |
| --- | --- |
| `GMAIL_USER` | `christian.arriagada12@gmail.com` |
| `GMAIL_APP_PASSWORD` | Contraseña de aplicación Google (2FA) |
| `STATEMENT_PDF_PASSWORD` | Clave PDF cartola/EECC |

También: `pip install pypdf` en el entorno del agente.

## Ver el HTML

Tras un sync:

1. Artifact `spend-dashboard` → `GET /cuenta-corriente/v1/artifacts/<id>/content`
2. O archivo durable `dashboard/estado.html` (scope deployment)
3. O en chat: *“regenera el dashboard y dame el link/id del artifact”*

El HTML se auto-refresca en el navegador cada 15 min (`meta refresh`).

## Uso local rápido

```bash
npm install
cp .env.example .env.local
npx --yes "@grok/agent-sdk@0.5.0" login
npx --yes "@grok/agent-sdk@0.5.0" serve --dir . --mode single --dev
```
