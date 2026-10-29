---
cron: "0 13 * * 1"
---

Es lunes ~13:00 UTC: haz el seguimiento de gastos.

1. Llama `get_tracking_preference`. Si la cadencia es `daily`, responde en una línea que saltas el digest semanal y termina.
2. Si la cadencia es `weekly`, `biweekly` o `uncategorized_only`:
   - Llama `category_summary`.
   - Llama `list_transactions` con `uncategorizedOnly: true` y un `limit` razonable.
3. Resume en español: total gastado, desglose por categoría, y pregunta por los comercios sin categoría (agrupa por comercio).
4. Incluye también avisos `compra_alerta` recientes si hay.
5. No inventes movimientos. Si no hay datos, pide que peguen un aviso de compra, cartola o EECC.
6. Recuerda que puede cambiar la cadencia (“cámbialo a diario/quincenal/solo sin categorizar”).
