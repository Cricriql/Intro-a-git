/** Suggested Spanish spend categories. Soft classification stays with the model. */

export const CATEGORIES = [
  "comida",
  "transporte",
  "supermercado",
  "suscripciones",
  "transferencias",
  "salud",
  "fitness",
  "donaciones",
  "servicios",
  "entretenimiento",
  "vivienda",
  "ingresos",
  "bancario",
  "otros",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

type Hint = { match: RegExp; category: Category };

/** Merchant / description hint rules. First match wins. */
const HINTS: Hint[] = [
  { match: /UBER\s*EATS|RAPYD\s*\*UBER\s*EATS|PAYU\s*\*UBER\s*EATS|PEDIDOS?\s*YA|RAPPI|CORNERSHOP/i, category: "comida" },
  { match: /UBER\s*TRIP|PAYU\s*\*UBER\s*TRIP|\bUBER\b|CABIFY|DIDI|Red\s*Movilidad|METRO|BIP!|SABA\s*ESTACION|MT\s*AUT|AUTOPISTA|TAG\b/i, category: "transporte" },
  { match: /\bJUMBO\b|\bLIDER\b|UNIMARC|TOTTUS|SANTA\s*ISABEL|EXPRESS\s|C\.\s*VERDE|OK\s*MARKET|SUPER\s*BODEGA|MERPAGO\*CONVENIEN|MERCADOPAGO\*CONVE|CONVENIENCE/i, category: "supermercado" },
  { match: /MICROSOFT|NETFLIX|SPOTIFY|YOUTUBE|APPLE\.COM|GOOGLE\s*\*|AMAZON\s*PRIME|DISNEY|HBO|ADOBE|GITHUB|OPENAI|CURSOR/i, category: "suscripciones" },
  { match: /TRASPASO|TRANSFERENCIA|TEF\b|PAGO\s*LINEA\s*DE\s*CRED/i, category: "transferencias" },
  { match: /FARMACIA|CRUZ\s*VERDE|SALCOBRAND|AHUMADA|CLINICA|HOSPITAL|ISAPRE|FONASA|DENTAL|MEDICO/i, category: "salud" },
  { match: /POWER\s*FITNESS|EQUINOX|SMART\s*FIT|ENERGY\s*FIT|GYM|SPORTLIFE/i, category: "fitness" },
  { match: /FUNDACION|COANIQUEM|UNICEF|TECHO|DONAC|CRUZ\s*ROJA|GREENPEACE/i, category: "donaciones" },
  { match: /ENTEL|MOVISTAR|WOM\b|VTR\b|CLARO|ENEL|CGE\b|AGUAS\s*ANDINAS|ESSAL|RECAUDACION\s*Y\s*PAGOS\s*DE\s*SERVICIOS/i, category: "servicios" },
  { match: /CINE|CINEPOLIS|HOYTS|STEAM|PLAYSTATION|NINTENDO|SPOTIFY/i, category: "entretenimiento" },
  { match: /ARRIENDO|CONDOMINIO|ADMINISTRADORA|CONTRIBUCIONES/i, category: "vivienda" },
  { match: /SALDO\s*INICIAL|ABONO|DEPOSITO|SUELDO|REMUNERACION|HABER/i, category: "ingresos" },
  { match: /AMORTIZACION|LINEA\s*DE\s*CREDITO|COMISION|INTERES|IMPUESTO|BANCO/i, category: "bancario" },
  { match: /FUDO|SUSHI|RESTAURANT|RESTAURANTE|CAFE|CAFETERIA|PANADERIA|PASTELERIA|COMIDA|DELIVERY|AY\s*MI\s*MADRE|AVATAR\s*SUSHI|LA\s*BARCELONA|CARNE\s*NACIONAL|TOP\s*-\s*PLAZA/i, category: "comida" },
  { match: /MERCADOPAGO|MASS\b|KIOSKO|SUBCENT/i, category: "supermercado" },
];

export function normalizeMerchant(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export function suggestCategory(description: string, merchant?: string): Category | null {
  const haystack = `${merchant ?? ""} ${description}`;
  for (const hint of HINTS) {
    if (hint.match.test(haystack)) return hint.category;
  }
  return null;
}
