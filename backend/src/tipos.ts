export type Margen = 0.1 | 0.2 | 0.3;
export const MARGENES_VALIDOS: number[] = [0.1, 0.2, 0.3];

export type EstadoEvento = 'borrador' | 'por_aprobar' | 'pagado' | 'ajustado' | 'revision_humana';
export type EstadoPartida = 'pendiente' | 'por_aprobar' | 'aprobado' | 'pagado' | 'ajustado' | 'no_lograda' | 'bloqueado';
export type ModoPago = 'aprobacion' | 'simulado';
export type Actor = 'agente' | 'reglas' | 'humano';

export interface Brief {
  nombre: string;
  fecha: string;
  asistentes: number;
  presupuestoMXN: number;
  margen: Margen;
  notas?: string;
}

export interface Partida {
  nombre: string;
  comercio: string;
  presupuestadoMXN: number;
  cotizadoMXN: number | null;
  cobradoMXN: number | null;
  estado: EstadoPartida;
  orderId: string | null;
  tipoCambio: number | null;
  checkoutId: string | null;
  urlAprobacion: string | null;
  aprobacionExpira: string | null;
}

export interface EntradaTimeline {
  hora: string;
  actor: Actor;
  mensaje: string;
}

export interface Totales {
  presupuestadoMXN: number;
  cotizadoMXN: number;
  cobradoMXN: number;
  costoPorAsistenteMXN: number;
}

export interface Evento {
  id: string;
  nombre: string;
  fecha: string;
  asistentes: number;
  presupuestoMXN: number;
  margen: Margen;
  notas?: string;
  techoMXN: number;
  estado: EstadoEvento;
  modoSimulado: boolean;
  modoPago: ModoPago;
  totales: Totales;
  partidas: Partida[];
  timeline: EntradaTimeline[];
}

export function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
