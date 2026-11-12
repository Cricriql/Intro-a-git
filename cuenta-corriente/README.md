# cuenta-corriente

Agente de gastos Banco de Chile. Lee Gmail solo cuando se lo pides, guarda los movimientos y regenera un **HTML de estado**.

## Qué hace (flujo)

```
Tú pides “sincroniza”
   ▼
Gmail (IMAP solo lectura)
   ▼
sync_gmail  → parsea avisos / cartola / EECC
   │
   ├─ host.kv (movimientos + categorías aprendidas)
   └─ HTML dashboard
         ├─ artifact "spend-dashboard"
         └─ host.files: dashboard/estado.html
```

En el playground: *“sincroniza”*, *“estado de la cuenta”*, *“regenera el HTML”*.

## Encenderlo

Los secretos van en el deployment o en `.env.local`: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `STATEMENT_PDF_PASSWORD`.

```bash
cd cuenta-corriente
npx --yes "@grok/agent-sdk@0.5.0" serve --dir . --mode single
```

El correo no se revisa solo. Mientras el servidor está abierto puedes pedirle que sincronice. El lunes sigue un resumen de lo que ya está en memoria (no lee Gmail); la cadencia se cambia con `set_tracking_preference`.

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
publica como artifact `spend-dashboard`. Se regenera cuando pides una sincronización.

Contenido:

- **Pagos del mes**: pago de tarjeta de crédito + pagos recurrentes confirmados
  (`set_recurring_payment`) y sugeridos, con estado pagado / pendiente / atrasado.
- **Tres bloques**: cuenta corriente, tarjeta ya pagada, y cuotas que siguen en el cupo utilizado.
  El precio de las compras avisadas no se presenta como monto a facturar: si la compra fue en cuotas, esa parte se conoce cuando llega el estado.
  Del estado se leen cupo utilizado, monto facturado y saldo en cuotas.
- El histórico lee al menos **500** correos y acepta hasta **2000** (`sync_gmail` con `fullHistory`).
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
