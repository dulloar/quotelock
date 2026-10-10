import type { Evento } from './tipos.ts';
import type { PartidaPlan } from './plan.ts';

// Estado interno que NO se serializa al front.
export interface Interno {
  ejecutando: boolean;
  // estados de checkout por indice de partida (para regla de cobro doble)
  checkouts: Record<number, string[]>;
  hayReplan: boolean;
  ultimaRonda: number;
  refrescando: boolean;
  // plan armado en ejecutar (para recotizar en reintentar)
  plan?: PartidaPlan[];
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
    if (!this.internos.has(e.id)) this.internos.set(e.id, { ejecutando: false, checkouts: {}, hayReplan: false, ultimaRonda: 0, refrescando: false });
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
