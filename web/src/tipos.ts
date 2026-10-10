// Contrato de docs/05-tareas-mvp.md, sección 3. Espejo de backend/src/tipos.ts.

export type Margen = 0.1 | 0.2 | 0.3;

export type EstadoEvento = 'borrador' | 'pagado' | 'ajustado' | 'revision_humana';
export type EstadoPartida = 'pendiente' | 'pagado' | 'ajustado' | 'no_lograda' | 'bloqueado';
export type Actor = 'agente' | 'reglas' | 'humano';

export interface Brief {
  nombre: string;
  fecha: string;
  asistentes: number;
  presupuestoMXN: number;
  margen: Margen;
}

export interface Partida {
  nombre: string;
  comercio: string;
  presupuestadoMXN: number;
  cotizadoMXN: number | null;
  cobradoMXN: number | null;
  estado: EstadoPartida;
  orderId: string | null;
  tipoCambio?: number | null;
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

export interface Evento extends Brief {
  id: string;
  techoMXN: number;
  estado: EstadoEvento;
  modoSimulado: boolean;
  totales: Totales;
  partidas: Partida[];
  timeline: EntradaTimeline[];
}
