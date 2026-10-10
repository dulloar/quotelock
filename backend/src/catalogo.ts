export interface Producto {
  id: string;
  comercio: string;
  nombre: string;
  query: string; // texto de búsqueda para el cliente real
  precio: number;
  moneda: 'MXN' | 'USD';
}

// Catálogo simulado con precios de la lista del hackathon.
export const CATALOGO: Producto[] = [
  { id: 'cafe-250g', comercio: 'blendstation.com.mx', nombre: 'Café 250 g', query: 'cafe 250g', precio: 300, moneda: 'MXN' },
  { id: 'planner', comercio: 'mossery.co', nombre: 'Planner', query: 'planner', precio: 13.5, moneda: 'USD' },
  { id: 'notepad', comercio: 'stationerypal.com', nombre: 'Notepad', query: 'notepad', precio: 1.41, moneda: 'USD' },
  { id: 'galletas-4', comercio: 'levainbakery.com', nombre: 'Galletas 4 pzas', query: 'cookies 4 pack', precio: 32, moneda: 'USD' },
  { id: 'teclado', comercio: 'keychron.com', nombre: 'Teclado', query: 'keyboard', precio: 49.99, moneda: 'USD' },
  { id: 'cargador', comercio: 'twelvesouth.com', nombre: 'Cargador', query: 'charger', precio: 49.99, moneda: 'USD' },
  { id: 'hub', comercio: 'satechi.net', nombre: 'Hub USB-C', query: 'usb-c hub', precio: 44.99, moneda: 'USD' },
  { id: 'mouse', comercio: 'acteck.com', nombre: 'Mouse', query: 'mouse', precio: 259, moneda: 'MXN' },
];

// Envío simulado por comercio (en la moneda del comercio).
export const ENVIO: Record<string, number> = {
  'blendstation.com.mx': 99,
  'acteck.com': 99,
  'balamrush.com': 99,
  'mossery.co': 5,
  'stationerypal.com': 5,
  'levainbakery.com': 8,
  'keychron.com': 6,
  'twelvesouth.com': 6,
  'satechi.net': 6,
};
