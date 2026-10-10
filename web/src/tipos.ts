// Contrato de docs/05-tareas-mvp.md, sección 3. Espejo de backend/src/tipos.ts.

export type Margen = 0.1 | 0.2 | 0.3;

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
  /** Texto libre: el backend lo guarda y nunca influye en reglas ni montos. */
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
  tipoCambio?: number | null;
  // Pago con aprobación en Reap (9 oct). Opcionales al leer: los datos de ejemplo viejos no los traen.
  /** Cargo creado en Reap para esta partida. */
  checkoutId?: string | null;
  /** Página de Reap donde una persona aprueba el cargo. Solo mientras la partida está `por_aprobar`. */
  urlAprobacion?: string | null;
  /** Fecha ISO en que vence la aprobación (15 min después de crear el cargo). */
  aprobacionExpira?: string | null;
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
  /** `aprobacion`: una persona aprueba cada cargo en Reap. Opcional al leer (datos viejos). */
  modoPago?: ModoPago;
  totales: Totales;
  partidas: Partida[];
  timeline: EntradaTimeline[];
}
