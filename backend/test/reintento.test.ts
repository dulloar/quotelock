import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReapReal } from '../src/reap.ts';

const prod = (id: string, name: string, price: number) => ({ id, name, previewVariant: { id: `var_${id}`, price: { amount: price, currency: 'MXN' } } });
const BUSQUEDA = { products: [prod('prd_a', 'Café Guerrero Atoyac · Blend Station', 300)] };
const QUOTE = {
  id: 'q1', shippingOptions: [{ id: 's0', selected: true }],
  amountBreakdown: { finalAmount: { amount: 360, currency: 'MXN' } }, expiresAt: '2026-10-10T02:34:25.888Z',
};
const cfg = { baseUrl: 'https://x', apiKey: 'k', version: '2025-02-14', returnUrl: 'https://r', enrollmentId: 'enr', email: 'e@x.com' };

test('ReapReal: 503 pasajero en cotización se reintenta con la misma Idempotency-Key, sin dormir', async () => {
  const esperas: number[] = [];
  const llaves: string[] = [];
  let n = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init: any) => {
    if (String(url).endsWith('/products/search')) return new Response(JSON.stringify(BUSQUEDA), { status: 200 });
    llaves.push(init.headers['Idempotency-Key']);
    n += 1;
    return n < 3
      ? new Response(JSON.stringify({ error: { code: 'AGENTIC_SERVICE_UNAVAILABLE', message: 'x' } }), { status: 503 })
      : new Response(JSON.stringify(QUOTE), { status: 200 });
  }) as any;
  try {
    const r = new ReapReal({ ...cfg, espera: async (ms: number) => { esperas.push(ms); } });
    const q = await r.cotizar({ comercio: 'blendstation.com.mx', productoId: '', query: 'cafe', cantidad: 2 });
    assert.equal(q.finalAmount, 360);
    assert.equal(n, 3);
    assert.deepEqual(esperas, [1000, 2000]);
    assert.equal(new Set(llaves).size, 1);
  } finally { globalThis.fetch = original; }
});

test('ReapReal: error de red se reintenta y tras 3 reintentos se rinde', async () => {
  let n = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { n += 1; throw new TypeError('fetch failed'); }) as any;
  try {
    const r = new ReapReal({ ...cfg, espera: async () => {} });
    await assert.rejects(r.cotizar({ comercio: 'blendstation.com.mx', productoId: '', query: 'cafe', cantidad: 2 }), (e: any) => e.code === 'NETWORK_ERROR');
    assert.equal(n, 4);
  } finally { globalThis.fetch = original; }
});

test('ReapReal: Retry-After se respeta con tope de 5 s', async () => {
  const esperas: number[] = [];
  let n = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    n += 1;
    if (n === 1) return new Response('{}', { status: 429, headers: { 'Retry-After': '30' } });
    return new Response(JSON.stringify(String(url).endsWith('/products/search') ? BUSQUEDA : QUOTE), { status: 200 });
  }) as any;
  try {
    await new ReapReal({ ...cfg, espera: async (ms: number) => { esperas.push(ms); } }).cotizar({ comercio: 'blendstation.com.mx', productoId: '', query: 'cafe', cantidad: 1 });
    assert.deepEqual(esperas, [5000]);
  } finally { globalThis.fetch = original; }
});
