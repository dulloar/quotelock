import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReapSimulado, ReapError, mapearError, crearReap } from '../src/reap.ts';

test('simulado: cotización con finalAmount, moneda y expiresAt', async () => {
  const ahora = new Date('2026-10-09T12:00:00Z');
  const r = new ReapSimulado(() => ahora);
  const q = await r.cotizar({ comercio: 'blendstation.com.mx', productoId: 'cafe-250g', query: 'cafe', cantidad: 2 });
  assert.equal(q.moneda, 'MXN');
  assert.equal(q.finalAmount, 300 * 2 + 99);
  assert.ok(Date.parse(q.expiresAt) > ahora.getTime());
});

test('simulado: checkout COMPLETED con orderId y finalAmount', async () => {
  const r = new ReapSimulado();
  const q = await r.cotizar({ comercio: 'mossery.co', productoId: 'planner', query: 'planner', cantidad: 1 });
  assert.equal(q.moneda, 'USD');
  const c = await r.crearCheckout(q);
  assert.equal(c.status, 'COMPLETED');
  assert.match(c.orderId ?? '', /^ord_/);
  assert.equal(c.finalAmount, q.finalAmount);
});

test('sin REAP_API_KEY se usa el simulado', () => {
  assert.equal(crearReap({ REAP_API_KEY: '' }).modoSimulado, true);
});

test('mapeo de errores de Reap a error tipado con code', () => {
  const e = mapearError(409, { error: { code: 'QUOTE_EXPIRED', message: 'x', detail: '' } }, null);
  assert.ok(e instanceof ReapError);
  assert.equal(e.code, 'QUOTE_EXPIRED');
  assert.equal(mapearError(429, null, 3).code, 'RATE_LIMIT_EXCEEDED');
  assert.equal(mapearError(429, null, 3).retryAfter, 3);
});
