import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ejecutar, refrescar } from '../src/orquestador.ts';
import type { Deps } from '../src/orquestador.ts';
import { ReapSimulado, ReapError } from '../src/reap.ts';
import type { Checkout, Cotizacion, SolicitudCotizacion } from '../src/reap.ts';
import { Store } from '../src/store.ts';
import { nuevoEvento } from './helpers.ts';

class Falso extends ReapSimulado {
  override modoSimulado = false as unknown as true;
  override modoPago: 'aprobacion' | 'simulado' = 'simulado';
  creados = 0;
  pedidas: SolicitudCotizacion[] = [];
  falla: (s: SolicitudCotizacion) => string | null = () => null;
  override async cotizar(s: SolicitudCotizacion): Promise<Cotizacion> {
    this.pedidas.push(s);
    const code = this.falla(s);
    if (code) throw new ReapError(code, 'x', 409);
    return { id: `q${this.pedidas.length}`, comercio: s.comercio, productoId: s.productoId, nombreProducto: s.query, cantidad: s.cantidad, moneda: 'MXN', finalAmount: 100 * s.cantidad, expiresAt: '2099-01-01T00:00:00Z', paisEnvio: 'MX' };
  }
  override async crearCheckout(q: Cotizacion): Promise<Checkout> {
    this.creados += 1;
    if (this.modoPago === 'simulado') return { id: `c${this.creados}`, status: 'COMPLETED', orderId: `o${this.creados}`, finalAmount: q.finalAmount, moneda: q.moneda };
    return { id: `c${this.creados}`, status: 'REQUIRES_ACTION', orderId: null, finalAmount: q.finalAmount, moneda: q.moneda, nextAction: { url: 'https://reap/a', expiresAt: null } };
  }
  override async obtenerCheckout(id: string): Promise<Checkout> {
    return { id, status: 'PROCESSING', orderId: `o_${id}`, finalAmount: 100, moneda: 'MXN' };
  }
}

function montar(modo: 'aprobacion' | 'simulado', presupuesto = 100000) {
  const reap = new Falso();
  reap.modoPago = modo;
  let t = 1_000_000;
  const deps: Deps = { reap, ahora: () => new Date(t), fx: 18.5 };
  const store = new Store();
  const e = nuevoEvento(store, presupuesto, 0.1);
  return { reap, deps, store, e, avanzar: () => { t += 3000; } };
}

const esCafe = (s: SolicitudCotizacion) => s.comercio === 'blendstation.com.mx';

test('cantidad adaptable: falla con la cantidad pedida, funciona con la mitad', async () => {
  const { reap, deps, store, e } = montar('simulado');
  reap.falla = (s) => (s.query === 'notepad' && s.cantidad > 20 ? 'VARIANT_UNAVAILABLE' : null);
  await ejecutar(deps, e, store.interno(e.id));
  const intentos = reap.pedidas.filter((s) => s.query === 'notepad').map((s) => s.cantidad);
  assert.deepEqual(intentos, [40, 20]);
  assert.equal(e.estado, 'ajustado');
  assert.ok(e.timeline.some((t) => t.actor === 'agente' && t.mensaje === 'Solo hay existencias para 20 de 40 en stationerypal.com; ajustó la cantidad'));
  assert.equal(e.partidas[1].estado, 'ajustado');
});

test('una partida sin cotización: el evento sigue, paga las demás y queda ajustado', async () => {
  const { reap, deps, store, e } = montar('simulado');
  reap.falla = (s) => (esCafe(s) ? 'QUOTE_UNFULFILLABLE' : null);
  await ejecutar(deps, e, store.interno(e.id));
  assert.equal(e.estado, 'ajustado');
  assert.equal(reap.creados, 2);
  assert.equal(e.partidas[0].estado, 'no_lograda');
  assert.ok(e.partidas[0].motivo);
  assert.ok(e.partidas.slice(1).every((p) => p.estado === 'pagado' || p.estado === 'ajustado'));
  assert.ok(e.timeline.some((t) => t.actor === 'agente' && t.mensaje === 'No se logró Café para el evento: sin existencias o sin cotización; el plan sigue sin ella'));
});

test('nada cotiza -> revision_humana con 0 checkouts', async () => {
  const { reap, deps, store, e } = montar('simulado');
  reap.falla = () => 'VARIANT_UNAVAILABLE';
  await ejecutar(deps, e, store.interno(e.id));
  assert.equal(e.estado, 'revision_humana');
  assert.equal(reap.creados, 0);
});

test('aprobación con una partida sin cotización: por_aprobar y tras aprobar el resto -> ajustado', async () => {
  const { reap, deps, store, e, avanzar } = montar('aprobacion');
  reap.falla = (s) => (esCafe(s) ? 'AGENTIC_REQUEST_REJECTED' : null);
  await ejecutar(deps, e, store.interno(e.id));
  assert.equal(e.estado, 'por_aprobar');
  assert.equal(e.partidas.filter((p) => p.estado === 'por_aprobar').length, 2);
  avanzar();
  await refrescar(deps, e, store.interno(e.id));
  assert.equal(e.estado, 'ajustado');
  assert.equal(e.partidas[0].estado, 'no_lograda');
});
