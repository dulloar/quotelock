// Stub de B0; se reemplaza en B3.
import type { Evento } from './tipos.ts';
import type { Interno } from './store.ts';
import type { ReapClient } from './reap.ts';
export interface Deps { reap: ReapClient; ahora: () => Date; fx: number }
export async function ejecutar(_d: Deps, _e: Evento, _i: Interno): Promise<void> {}
