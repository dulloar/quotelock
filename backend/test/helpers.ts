import { ReapSimulado } from '../src/reap.ts';
import type { Checkout, Cotizacion } from '../src/reap.ts';
import { Store } from '../src/store.ts';
import { redondear } from '../src/tipos.ts';
import type { Evento, Margen } from '../src/tipos.ts';

export class ReapEspia extends ReapSimulado {
  llamadasCheckout = 0;
  override async crearCheckout(q: Cotizacion): Promise<Checkout> {
    this.llamadasCheckout += 1;
    return super.crearCheckout(q);
  }
}

export function nuevoEvento(store: Store, presupuestoMXN: number, margen: Margen, notas?: string): Evento {
  const e: Evento = {
    id: store.siguienteId(), nombre: 'Workshop', fecha: '2026-10-24', asistentes: 40, presupuestoMXN, margen,
    techoMXN: redondear(presupuestoMXN * (1 + margen)), estado: 'borrador', modoSimulado: true,
    totales: { presupuestadoMXN: presupuestoMXN, cotizadoMXN: 0, cobradoMXN: 0, costoPorAsistenteMXN: 0 },
    partidas: [], timeline: [],
  };
  if (notas !== undefined) e.notas = notas;
  store.guardar(e);
  return e;
}

