import type { Evento } from './tipos.ts';
import type { PartidaPlan, ItemPlan } from './plan.ts';
import type { Cotizacion } from './reap.ts';

export interface ItemLlm {
  item: ItemPlan;
  cot: Cotizacion;
  mxn: number;
  tc: number;
  presupuestadoMXN: number;
}

// Estado del agente LLM / herramientas MCP por evento (no se serializa).
export interface EstadoAgente {
  llamadas: number;
  cargosCreados: boolean;
  cerrado: boolean;
  items: Record<string, ItemLlm>; // por nombre de partida
  variantes: Record<string, { comercio: string; nombre: string; precio: number; moneda: string }>; // 'comercio|varianteId'
}

// Estado interno que NO se serializa al front.
export interface Interno {
  ejecutando: boolean;
  // estados de checkout por indice de partida (para regla de cobro doble)
  checkouts: Record<number, string[]>;
  hayReplan: boolean;
  ultimaRonda: number;
  refrescando: boolean;
  // plan armado en ejecutar (para recotizar en reintentar)
  // partidas (por índice) sin cotización posible -> motivo; no bloquean el cierre del evento
  sinCotizacion: Record<number, string>;
  plan?: PartidaPlan[];
  llm?: EstadoAgente;
}

export class Store {
  eventos = new Map<string, Evento>();
  internos = new Map<string, Interno>();
  contador = 0;

  siguienteId(): string {
    this.contador += 1;
    return `evt_${this.contador}`;
  }
  guardar(e: Evento): void {
    this.eventos.set(e.id, e);
    if (!this.internos.has(e.id)) this.internos.set(e.id, { ejecutando: false, checkouts: {}, hayReplan: false, ultimaRonda: 0, refrescando: false, sinCotizacion: {} });
  }
  obtener(id: string): Evento | undefined {
    return this.eventos.get(id);
  }
  interno(id: string): Interno {
    return this.internos.get(id)!;
  }
  listar(): Evento[] {
    return [...this.eventos.values()];
  }
}
