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

También: `pip install -r requirements.txt` en el entorno del agente (los PDF del banco usan cifrado AES, que requiere `pypdf[crypto]`).

## Ver el HTML

Tras un sync, con `serve` local el archivo queda en:

```
cuenta-corriente/.agent-serve/files/deployment/dashboard/estado.html
```

(En Windows: `start .agent-serve\files\deployment\dashboard\estado.html`.) También se
publica como artifact `spend-dashboard`. El HTML se auto-refresca cada 15 min.

Contenido:

- **Pagos del mes**: pago de tarjeta de crédito + pagos recurrentes confirmados
  (`set_recurring_payment`) y sugeridos, con estado pagado / pendiente / atrasado.
- **Tres bloques separados**: cuenta corriente (cartola), tarjeta facturada
  (el cargo por pago de la tarjeta en la cuenta) y tarjeta no facturada (avisos
  posteriores a ese estado). Las compras en cuotas muestran la cuota del próximo
  estado aparte de las que salen en los meses siguientes.
- El histórico lee hasta **500** correos (`sync_gmail` con `fullHistory` y `limit: 500`).
- **Gráfico de torta por mes** con el gasto real por categoría: excluye pagos de
  tarjeta, saldos y sueldos, y cuenta una sola vez la compra que aparece en el aviso y en el EECC Visa.
- Totales por categoría y últimos cargos.

## Uso local rápido

```bash
npm install
cp .env.example .env.local
npx --yes "@grok/agent-sdk@0.5.0" login
npx --yes "@grok/agent-sdk@0.5.0" serve --dir . --mode single --dev
```
