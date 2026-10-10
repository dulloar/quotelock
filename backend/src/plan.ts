import type { Evento } from './tipos.ts';
import { redondear } from './tipos.ts';

export interface ItemPlan {
  comercio: string;
  productoId: string;
  query: string;
  cantidad: number;
  descripcion: string;
  // Solo planes armados por el agente LLM: variante exacta a recotizar.
  varianteId?: string;
}

export interface PartidaPlan {
  nombre: string;
  presupuestadoMXN: number;
  preferido: ItemPlan;
  // ordenadas de menos a más barata; la última es la más barata
  alternativas: ItemPlan[];
}

// Reparto del presupuesto: café 10%, kit 40%, postres 30%, regalo ponentes 20%.
export function armarPlan(evento: Pick<Evento, 'asistentes' | 'presupuestoMXN'>, real = false): PartidaPlan[] {
  const n = evento.asistentes;
  const p = evento.presupuestoMXN;
  if (real) return armarPlanReal(n, p);
  const cajasPostre = Math.ceil(n / 4); // 1 pieza por asistente
  const bolsasCafe = Math.max(1, Math.ceil(n / 5));
  return [
    {
      nombre: 'Café para el evento',
      presupuestadoMXN: redondear(p * 0.1),
      preferido: { comercio: 'blendstation.com.mx', productoId: 'cafe-250g', query: 'cafe 250g', cantidad: bolsasCafe, descripcion: `${bolsasCafe} bolsas de café` },
      alternativas: [
        { comercio: 'blendstation.com.mx', productoId: 'cafe-250g', query: 'cafe 250g', cantidad: Math.max(1, Math.ceil(bolsasCafe * 0.6)), descripcion: 'café en porción reducida' },
      ],
    },
    {
      nombre: 'Kit del asistente',
      presupuestadoMXN: redondear(p * 0.4),
      preferido: { comercio: 'mossery.co', productoId: 'planner', query: 'planner', cantidad: n, descripcion: `${n} planners` },
      alternativas: [
        { comercio: 'stationerypal.com', productoId: 'notepad', query: 'notepad', cantidad: n, descripcion: `${n} notepads` },
      ],
    },
    {
      nombre: 'Postres',
      presupuestadoMXN: redondear(p * 0.3),
      preferido: { comercio: 'levainbakery.com', productoId: 'galletas-4', query: 'cookies 4 pack', cantidad: cajasPostre, descripcion: `${cajasPostre} cajas de galletas` },
      alternativas: [
        { comercio: 'levainbakery.com', productoId: 'galletas-4', query: 'cookies 4 pack', cantidad: Math.max(1, Math.ceil(cajasPostre / 2)), descripcion: 'galletas en media porción' },
      ],
    },
    {
      nombre: 'Regalo para 3 ponentes',
      presupuestadoMXN: redondear(p * 0.2),
      preferido: { comercio: 'keychron.com', productoId: 'teclado', query: 'keyboard', cantidad: 3, descripcion: '3 teclados' },
      alternativas: [
        { comercio: 'satechi.net', productoId: 'hub', query: 'usb-c hub', cantidad: 3, descripcion: '3 hubs USB-C' },
        { comercio: 'acteck.com', productoId: 'mouse', query: 'mouse', cantidad: 3, descripcion: '3 mouse' },
      ],
    },
  ];
}

// Plan para el catálogo REAL del sandbox: solo comercios verificados (ver COMERCIOS[..].nombre).
// No hay comercio de postres verificado, así que el reparto es: café 20%, kit 50%, regalo 30%.
// El cliente real elige el producto disponible más barato que pase las reglas; productoId no se usa.
function armarPlanReal(n: number, p: number): PartidaPlan[] {
  const bolsasCafe = Math.max(1, Math.ceil(n / 5));
  const item = (comercio: string, query: string, cantidad: number, descripcion: string): ItemPlan => ({ comercio, productoId: '', query, cantidad, descripcion });
  return [
    {
      nombre: 'Café para el evento',
      presupuestadoMXN: redondear(p * 0.2),
      preferido: item('blendstation.com.mx', 'cafe', bolsasCafe, `${bolsasCafe} bolsas de café`),
      alternativas: [item('blendstation.com.mx', 'cafe', Math.max(1, Math.ceil(bolsasCafe * 0.6)), 'café en porción reducida')],
    },
    {
      nombre: 'Kit del asistente',
      presupuestadoMXN: redondear(p * 0.5),
      preferido: item('stationerypal.com', 'notepad', n, `${n} notepads`),
      alternativas: [
        item('stationerypal.com', 'memo pad', n, `${n} memo pads`),
        item('stationerypal.com', 'memo pad', Math.max(1, Math.ceil(n * 0.6)), 'memo pads en porción reducida'),
      ],
    },
    {
      nombre: 'Regalo para 3 ponentes',
      presupuestadoMXN: redondear(p * 0.3),
      preferido: item('acteck.com', 'mouse', 3, '3 mouse'),
      alternativas: [item('stationerypal.com', 'notebook', 3, '3 libretas')],
    },
  ];
}
