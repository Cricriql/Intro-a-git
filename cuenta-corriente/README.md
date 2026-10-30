# cuenta-corriente

Agente Agent SDK para gastos Banco de Chile con **sync automático de Gmail**, memoria de categorías y estado de cuenta consultable.

## Qué hace

- Cada 15 minutos revisa Gmail (avisos de compra, cartola, EECC).
- Parsea mails y PDFs, guarda movimientos en memoria durable (`host.kv`).
- Aprende comercio→categoría cuando confirmas.
- Responde estado de cuenta / “cuánto llevo” con `account_status`.
- Seguimiento semanal (cambiable).

## Secretos (obligatorios para lo automático)

Copia `.env.example` → `.env.local` (local) o configúralos en el deploy:

| Secreto | Uso |
| --- | --- |
| `GMAIL_USER` | `christian.arriagada12@gmail.com` |
| `GMAIL_APP_PASSWORD` | Contraseña de aplicación de Google (2FA) |
| `STATEMENT_PDF_PASSWORD` | Clave de PDFs cartola/EECC |

Solo lectura IMAP. No pide clave del banco.

También: `pip install pypdf` en el entorno donde corra el agente (para PDFs cifrados).

## Uso local

```bash
cd cuenta-corriente
npm install
cp .env.example .env.local   # completa secretos
npx --yes "@grok/agent-sdk@0.5.0" login
npx --yes "@grok/agent-sdk@0.5.0" serve --dir . --mode single --dev
```

Playground: http://127.0.0.1:3000/playground

Prueba sync manual:

```bash
npx --yes "@grok/agent-sdk@0.5.0" tool call sync_gmail --dir . --input '{"fullHistory":true,"limit":50}'
npx --yes "@grok/agent-sdk@0.5.0" tool call account_status --dir . --input '{}'
```

Dispatch del poll en dev:

```bash
curl -X POST http://127.0.0.1:3000/cuenta-corriente/v1/dev/schedules/gmail-poll
```

## Preguntas útiles

- “Sincroniza el correo y dame el estado”
- “¿Cuánto llevo gastado este mes?”
- “Categorízalo como comida y recuérdalo”
- “Cámbialo a seguimiento diario”
