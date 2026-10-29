---
name: categorizacion
description: Usa cuando el usuario pegue cartola/EECC/aviso de compra, pida categorizar gastos, o haya movimientos sin categoría.
---

# Categorización Banco de Chile

## Categorías base (usar estas en `set_category`)

`comida`, `transporte`, `supermercado`, `suscripciones`, `transferencias`, `salud`, `fitness`, `donaciones`, `servicios`, `entretenimiento`, `vivienda`, `ingresos`, `bancario`, `otros`.

Pistas frecuentes:

- Uber Eats / Rappi / PedidosYa / restaurantes → `comida`
- Uber Trip / Red Movilidad / peajes / estacionamiento → `transporte`
- Jumbo / Express / MercadoPago convenience / MASS / SBX → `supermercado`
- Microsoft / streaming / software → `suscripciones`
- Traspasos A/DE / transferencias → `transferencias`
- Power Fitness / Equinox → `fitness`
- UNICEF / Coaniquem / fundaciones → `donaciones`
- Avisos `Compra con Tarjeta de Crédito` (merchant tipo `MERPAGO*CONVENIENCEDE`) → suele ser `supermercado`

## Procedimiento

1. Texto nuevo (aviso de compra, cartola o Visa) → `parse_statement`.
2. Si el parse ya dejó `proposedCategory`, úsala como propuesta.
3. `list_transactions` con `uncategorizedOnly: true`.
4. Comercio nuevo o ambiguo → pregunta una sola vez; no una pregunta por cada fila del mismo comercio.
5. Confirmación → `set_category` (`learnMerchant: true` salvo que digan lo contrario).
6. Si pide resumen → `category_summary`.
7. Si cambia frecuencia → `set_tracking_preference` + `reminders_create` / `reminders_cancel`.

No mezcles abonos (sueldo, traspasos DE) con cargos en el mismo bucket de “gastos del mes”.
