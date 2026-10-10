import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejecutar } from '../src/orquestador.ts';
import type { Deps } from '../src/orquestador.ts';
import { ReapEspia, nuevoEvento } from './helpers.ts';
import { Store } from '../src/store.ts';

function montar() {
  const reap = new ReapEspia();
  const deps: Deps = { reap, ahora: () => new Date(), fx: 18.5 };
  return { reap, deps, store: new Store() };
}

// Mismo evento de 40 asistentes, tres casos variando presupuesto y margen.
test('caso 1: cabe -> pagado', async () => {
  const { reap, deps, store } = montar();
  const e = nuevoEvento(store, 30000, 0.1);
  await ejecutar(deps, e, store.interno(e.id));
  assert.equal(e.estado, 'pagado');
  assert.equal(reap.llamadasCheckout, 4);
  assert.ok(e.partidas.every((p) => p.estado === 'pagado' && p.orderId));
  assert.ok(e.totales.cobradoMXN <= 30000);
  assert.ok(e.totales.costoPorAsistenteMXN > 0);
});

test('caso 2: cabe con margen y replaneación -> ajustado', async () => {
  const { reap, deps, store } = montar();
  const e = nuevoEvento(store, 5500, 0.3);
  await ejecutar(deps, e, store.interno(e.id));
  assert.equal(e.estado, 'ajustado');
  assert.equal(reap.llamadasCheckout, 4);
  assert.ok(e.totales.cobradoMXN > 5500 && e.totales.cobradoMXN <= e.techoMXN);
  assert.ok(e.partidas.some((p) => p.estado === 'ajustado'));
  assert.ok(e.timeline.some((t) => t.actor === 'agente' && /Replaneó/.test(t.mensaje)));
});

test('caso 3: rebasa el techo -> revision_humana sin checkouts', async () => {
  const { reap, deps, store } = montar();
  const e = nuevoEvento(store, 5500, 0.1);
  await ejecutar(deps, e, store.interno(e.id));
  assert.equal(e.estado, 'revision_humana');
  assert.equal(reap.llamadasCheckout, 0);
  assert.equal(e.totales.cobradoMXN, 0);
  assert.ok(e.partidas.every((p) => p.estado === 'bloqueado'));
});

test('ejecutar dos veces no cobra dos veces', async () => {
  const { reap, deps, store } = montar();
  const e = nuevoEvento(store, 30000, 0.1);
  await ejecutar(deps, e, store.interno(e.id));
  await ejecutar(deps, e, store.interno(e.id));
  assert.equal(reap.llamadasCheckout, 4);
});

test('ejecución concurrente no cobra dos veces', async () => {
  const { reap, deps, store } = montar();
  const e = nuevoEvento(store, 30000, 0.1);
  await Promise.all([ejecutar(deps, e, store.interno(e.id)), ejecutar(deps, e, store.interno(e.id))]);
  assert.equal(reap.llamadasCheckout, 4);
});

// ---- Modo aprobación / simulado con cliente "real" falso ----
import { refrescar } from '../src/orquestador.ts';
import { ReapSimulado } from '../src/reap.ts';
import type { Checkout, Cotizacion, SolicitudCotizacion } from '../src/reap.ts';

class ReapRealFalso extends ReapSimulado {
  override modoSimulado = false as unknown as true;
  override modoPago: 'aprobacion' | 'simulado' = 'aprobacion';
  creados = 0;
  estadoGet = 'REQUIRES_ACTION';
  gets = 0;
  override async cotizar(s: SolicitudCotizacion): Promise<Cotizacion> {
    return { id: `q_${s.productoId}_${s.query}`, comercio: s.comercio, productoId: s.productoId, nombreProducto: s.query, cantidad: s.cantidad, moneda: 'MXN', finalAmount: 100, expiresAt: '2099-01-01T00:00:00Z', paisEnvio: 'MX' };
  }
  override async crearCheckout(q: Cotizacion): Promise<Checkout> {
    this.creados += 1;
    if (this.modoPago === 'simulado') return { id: `c${this.creados}`, status: 'COMPLETED', orderId: `sim_${this.creados}`, finalAmount: q.finalAmount, moneda: q.moneda };
    return { id: `c${this.creados}`, status: 'REQUIRES_ACTION', orderId: null, finalAmount: q.finalAmount, moneda: q.moneda, nextAction: { url: `https://reap/aprobar/${this.creados}`, expiresAt: '2030-01-01T00:00:00Z' } };
  }
  override async obtenerCheckout(id: string): Promise<Checkout> {
    this.gets += 1;
    const n = Number(id.slice(1));
    const status = this.estadoGet === 'MIXTO' ? (n === 1 ? 'FAILED' : 'PROCESSING') : this.estadoGet;
    return { id, status, orderId: status === 'PROCESSING' ? `ord_${n}` : null, finalAmount: 100, moneda: 'MXN' };
  }
}

function montarReal(modo: 'aprobacion' | 'simulado') {
  const reap = new ReapRealFalso();
  reap.modoPago = modo;
  let t = 1_000_000;
  const deps: Deps = { reap, ahora: () => new Date(t), fx: 18.5 };
  const store = new Store();
  const e = nuevoEvento(store, 30000, 0.1);
  return { reap, deps, store, e, avanzar: () => { t += 3000; } };
}

test('aprobación: ejecutar deja evento y partidas por_aprobar con URL', async () => {
  const { reap, deps, store, e } = montarReal('aprobacion');
  await ejecutar(deps, e, store.interno(e.id));
  assert.equal(e.estado, 'por_aprobar');
  assert.equal(e.modoPago, 'aprobacion');
  assert.equal(e.modoSimulado, false);
  assert.equal(reap.creados, 3);
  assert.ok(e.partidas.every((p) => p.estado === 'por_aprobar' && p.urlAprobacion && p.aprobacionExpira && p.checkoutId && p.cobradoMXN === null && p.cotizadoMXN !== null));
  assert.ok(e.timeline.some((t) => /espera aprobación en Reap/.test(t.mensaje)));
});

test('aprobación: ejecutar dos veces no crea más checkouts', async () => {
  const { reap, deps, store, e } = montarReal('aprobacion');
  await ejecutar(deps, e, store.interno(e.id));
  await ejecutar(deps, e, store.interno(e.id));
  assert.equal(reap.creados, 3);
});

test('aprobación: checkouts en PROCESSING -> aprobado, evento pagado, una entrada humano por partida', async () => {
  const { reap, deps, store, e, avanzar } = montarReal('aprobacion');
  await ejecutar(deps, e, store.interno(e.id));
  const i = store.interno(e.id);
  reap.estadoGet = 'REQUIRES_ACTION';
  avanzar();
  await refrescar(deps, e, i);
  assert.equal(e.estado, 'por_aprobar');
  reap.estadoGet = 'PROCESSING';
  avanzar();
  await refrescar(deps, e, i);
  const gets = reap.gets;
  await refrescar(deps, e, i); // throttle y ya no pendiente: no consulta
  assert.equal(reap.gets, gets);
  assert.equal(e.estado, 'pagado');
  assert.ok(e.partidas.every((p) => p.estado === 'aprobado' && p.cobradoMXN === 100 && p.orderId));
  assert.equal(e.totales.cobradoMXN, 300);
  assert.equal(e.timeline.filter((t) => t.actor === 'humano').length, 3);
  assert.equal(reap.creados, 3);
});

test('aprobación: respeta una ronda cada 2 s', async () => {
  const { reap, deps, store, e } = montarReal('aprobacion');
  await ejecutar(deps, e, store.interno(e.id));
  await refrescar(deps, e, store.interno(e.id));
  const g = reap.gets;
  await refrescar(deps, e, store.interno(e.id));
  assert.equal(reap.gets, g);
});

test('aprobación: un checkout FAILED -> no_lograda y evento revision_humana', async () => {
  const { reap, deps, store, e } = montarReal('aprobacion');
  await ejecutar(deps, e, store.interno(e.id));
  reap.estadoGet = 'MIXTO';
  await refrescar(deps, e, store.interno(e.id));
  assert.equal(e.estado, 'revision_humana');
  assert.equal(e.partidas[0].estado, 'no_lograda');
  assert.ok(e.partidas.slice(1).every((p) => p.estado === 'aprobado'));
});

test('MODO_PAGO=simulado con cliente real falso -> pagado y modoSimulado', async () => {
  const { deps, store, e } = montarReal('simulado');
  await ejecutar(deps, e, store.interno(e.id));
  assert.equal(e.estado, 'pagado');
  assert.equal(e.modoSimulado, true);
  assert.equal(e.modoPago, 'simulado');
  assert.ok(e.partidas.every((p) => p.estado === 'pagado' && p.orderId?.startsWith('sim_')));
});
