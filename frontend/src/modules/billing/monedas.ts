// Monedas admitidas para las tarifas.
//
// El sistema cobra en cualquier moneda; esta lista es solo la de referencia con
// la que el hotel publica sus precios. Se prioriza Latinoamerica, que es el
// mercado, y se incluyen las tres que ya maneja el nucleo (USD, EUR, VES).

export interface Moneda {
  codigo: string;
  nombre: string;
  simbolo: string;
  pais: string;
}

export const MONEDAS: Moneda[] = [
  { codigo: 'USD', nombre: 'Dólar',            simbolo: '$',   pais: 'Estados Unidos' },
  { codigo: 'VES', nombre: 'Bolívar',          simbolo: 'Bs.', pais: 'Venezuela' },
  { codigo: 'EUR', nombre: 'Euro',             simbolo: '€',   pais: 'Zona euro' },
  { codigo: 'COP', nombre: 'Peso colombiano',  simbolo: '$',   pais: 'Colombia' },
  { codigo: 'MXN', nombre: 'Peso mexicano',    simbolo: '$',   pais: 'México' },
  { codigo: 'BRL', nombre: 'Real',             simbolo: 'R$',  pais: 'Brasil' },
  { codigo: 'ARS', nombre: 'Peso argentino',   simbolo: '$',   pais: 'Argentina' },
  { codigo: 'PEN', nombre: 'Sol',              simbolo: 'S/',  pais: 'Perú' },
  { codigo: 'CLP', nombre: 'Peso chileno',     simbolo: '$',   pais: 'Chile' },
  { codigo: 'DOP', nombre: 'Peso dominicano',  simbolo: 'RD$', pais: 'Rep. Dominicana' },
  { codigo: 'PAB', nombre: 'Balboa',           simbolo: 'B/.', pais: 'Panamá' },
  { codigo: 'CRC', nombre: 'Colón',            simbolo: '₡',   pais: 'Costa Rica' },
];

export function monedaPorCodigo(codigo: string): Moneda {
  return MONEDAS.find((m) => m.codigo === codigo) ?? MONEDAS[0]!;
}
