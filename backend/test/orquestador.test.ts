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
