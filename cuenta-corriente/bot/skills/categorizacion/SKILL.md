---
name: categorizacion
description: Cómo proponer y confirmar categorías de gastos Banco de Chile.
---

# Categorización

## Categorías base

- `comida_delivery` — Uber Eats, Rappi, PedidosYa
- `restaurantes` — locales, pastelería, café
- `supermercado` — Jumbo, Express, convenience / MERPAGO*CONVENIENCE
- `transporte` — Uber Trip, Red Movilidad, peajes
- `suscripciones` — Microsoft, streaming, software
- `fitness` — gimnasios
- `salud` — farmacia, clínicas
- `donaciones` — UNICEF, Coaniquem, fundaciones
- `transferencias_enviadas` / `transferencias_recibidas`
- `pagos_servicios`, `estacionamiento`, `entretencion`
- `seguros_bancarios`, `linea_credito`, `sueldo_ingresos`
- `otros` — residual

## Reglas

1. Si `parse_statement` ya dejó `suggestedCategory`, úsala como propuesta.
2. Comercio nuevo o ambiguo → pregunta al usuario una sola vez; luego `set_category` + recordar merchant.
3. No mezcles abonos (sueldo, traspasos DE) con gastos en el mismo bucket de “gastos”.
4. Avisos de compra (`Compra con Tarjeta de Crédito`) tienen merchant en mayúsculas tipo `MERPAGO*CONVENIENCEDE` — propón `supermercado` salvo que el usuario diga otra cosa.
5. Para un aviso nuevo: `parse_statement` → muestra monto/comercio/fecha → pregunta solo si la categoría propuesta no convence.

## Procedimiento

1. Texto nuevo (aviso de compra, cartola o Visa) → `parse_statement`.
2. `list_transactions` con `uncategorizedOnly: true`.
3. Propón categorías; una pregunta por comercio ambiguo.
4. Confirmación → `set_category` (`learnMerchant: true`).
5. Si pide resumen → `category_summary`.
6. Si cambia frecuencia → `set_tracking_preference` + `reminders_create` / `reminders_cancel`.
