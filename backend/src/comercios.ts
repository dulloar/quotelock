export interface Comercio {
  moneda: 'MXN' | 'USD';
  enviaAMX: boolean;
  // Nombre exacto del comercio en Reap (merchantName). Solo si fue verificado contra el sandbox.
  nombre?: string;
}

// Lista propia de comercios permitidos (todos envían a MX).
export const COMERCIOS: Record<string, Comercio> = {
  'blendstation.com.mx': { moneda: 'MXN', enviaAMX: true, nombre: 'Blend Station' },
  'acteck.com': { moneda: 'MXN', enviaAMX: true, nombre: 'Acteck' },
  'balamrush.com': { moneda: 'MXN', enviaAMX: true, nombre: 'BalamRush' },
  'baronfig.com': { moneda: 'USD', enviaAMX: true },
  'mossery.co': { moneda: 'USD', enviaAMX: true },
  'stationerypal.com': { moneda: 'USD', enviaAMX: true, nombre: 'Stationery Pal' },
  'levainbakery.com': { moneda: 'USD', enviaAMX: true },
  'keychron.com': { moneda: 'USD', enviaAMX: true },
  'twelvesouth.com': { moneda: 'USD', enviaAMX: true },
  'satechi.net': { moneda: 'USD', enviaAMX: true },
  'deathwishcoffee.com': { moneda: 'USD', enviaAMX: true },
  'harney.com': { moneda: 'USD', enviaAMX: true },
};

// Categorías prohibidas por texto del producto.
export const PALABRAS_PROHIBIDAS = [
  'alcohol', 'vino', 'wine', 'cerveza', 'beer', 'tequila', 'whisky', 'whiskey', 'jack daniel', 'añejado', 'vodka', 'ron ', 'licor', 'mezcal',
  'vuelo', 'flight', 'hotel', 'viaje', 'travel', 'boleto de avion', 'airline',
];
