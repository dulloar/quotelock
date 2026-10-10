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

// ---- Fixtures: respuestas reales del sandbox ----
import { parsearMonto, elegirProducto, parsearCotizacion, mapearCheckoutReap, ReapReal } from '../src/reap.ts';
import { reglaComercio } from '../src/reglas.ts';
import { armarPlan } from '../src/plan.ts';

const prod = (id: string, name: string, amount: number, extra: object = {}) => ({
  id, name, merchant: { name: 'Blend Station' }, available: true,
  priceRange: { min: { amount, currency: 'MXN' }, max: { amount, currency: 'MXN' } },
  previewVariant: { id: `var_${id}`, name: '250 gr / Grano', price: { amount, currency: 'MXN' }, available: true }, ...extra,
});
const BUSQUEDA = {
  id: 'qry_1',
  products: [
    prod('prd_jack', 'Café añejado en Jack Daniel´s / Típica Bourbon · Blend Station ZD41', 150),
    prod('prd_a', 'Café Guerrero Atoyac / Bourbon Típica Natural Fermentado PREMIUM COLORS · Blend Station ZD242', 300),
    prod('prd_agotado', 'Café agotado', 100, { available: false }),
    prod('prd_b', 'Café DECAF Swiss Water', 200),
  ],
  pagination: { nextCursor: null, hasNextPage: false, returnedCount: 4 }, warnings: [],
};
const QUOTE = {
  id: 'd9641bb2-1', shippingOptions: [{ id: 'ship_0', name: 'Envío Local', selected: true, price: { amount: 60, currency: 'MXN' } }],
  amountBreakdown: {
    itemsSubtotal: { amount: 300, currency: 'MXN' }, shipping: { amount: 60, currency: 'MXN' }, tax: { amount: { amount: 0, currency: 'MXN' } },
    discounts: [], additionalCharges: [], finalAmount: { amount: 360, currency: 'MXN' },
  },
  expiresAt: '2026-10-10T02:34:25.888Z',
};

test('parsearMonto: objeto {amount,currency}, número suelto y nulo', () => {
  assert.deepEqual(parsearMonto({ amount: 60, currency: 'MXN' }), { amount: 60, currency: 'MXN' });
  assert.deepEqual(parsearMonto(12, 'USD'), { amount: 12, currency: 'USD' });
  assert.equal(parsearMonto(null), null);
  assert.equal(parsearMonto({ currency: 'MXN' }), null);
});

test('regla de alcohol: Jack Daniel, whisky y añejado se rechazan', () => {
  assert.equal(reglaComercio('blendstation.com.mx', 'MX', 'Café añejado en Jack Daniel´s').ok, false);
  assert.equal(reglaComercio('blendstation.com.mx', 'MX', 'Smoked Whiskey Barrel Coffee').ok, false);
  assert.equal(reglaComercio('blendstation.com.mx', 'MX', 'Café Oaxaca La Mixteca').ok, true);
});

test('elegirProducto: excluye alcohol y agotados, toma el más barato', () => {
  const c = elegirProducto(BUSQUEDA.products, 'blendstation.com.mx');
  assert.equal(c?.producto.id, 'prd_b');
  assert.equal(c?.variantId, 'var_prd_b');
  assert.deepEqual(c?.precio, { amount: 200, currency: 'MXN' });
  assert.equal(elegirProducto([BUSQUEDA.products[0]], 'blendstation.com.mx'), null);
});

test('parsearCotizacion: finalAmount objeto {amount,currency}', () => {
  const cand = elegirProducto(BUSQUEDA.products, 'blendstation.com.mx')!;
  const q = parsearCotizacion(QUOTE, { comercio: 'blendstation.com.mx', productoId: '', query: 'cafe', cantidad: 1 }, cand);
  assert.equal(q.finalAmount, 360);
  assert.equal(q.moneda, 'MXN');
  assert.equal(q.id, 'd9641bb2-1');
  assert.equal(q.productoId, 'prd_b');
});

test('mapearCheckoutReap: POST (amount) y GET FAILED con orderId', () => {
  const post = mapearCheckoutReap({ id: 'c1', status: 'REQUIRES_ACTION', amount: { amount: 360, currency: 'MXN' }, nextAction: { type: 'REDIRECT' } });
  assert.equal(post.status, 'REQUIRES_ACTION');
  assert.equal(post.finalAmount, 360);
  assert.equal(post.orderId, null);
  const get = mapearCheckoutReap({ id: 'c1', status: 'FAILED', orderId: 'ord_01M4', finalAmount: { amount: 360, currency: 'MXN' }, nextAction: null });
  assert.equal(get.status, 'FAILED');
  assert.equal(get.orderId, 'ord_01M4');
  assert.equal(get.moneda, 'MXN');
});

function conFetch(respuestas: (url: string, init: any) => unknown) {
  const original = globalThis.fetch;
  const llamadas: { url: string; init: any }[] = [];
  globalThis.fetch = (async (url: string, init: any) => {
    llamadas.push({ url, init });
    const r: any = respuestas(url, init);
    return new Response(JSON.stringify(r), { status: 200 });
  }) as any;
  return { llamadas, restaurar: () => { globalThis.fetch = original; } };
}
const cfg = { baseUrl: 'https://x', apiKey: 'k', version: '2025-02-14', returnUrl: 'https://r', enrollmentId: 'enr', email: 'e@x.com', pollMs: 1, pollMaxMs: 500 };

test('ReapReal.cotizar: busca por nombre de comercio, cotiza sin shipping-option si ya hay seleccionada', async () => {
  const f = conFetch((url) => (url.endsWith('/products/search') ? BUSQUEDA : QUOTE));
  try {
    const q = await new ReapReal(cfg).cotizar({ comercio: 'blendstation.com.mx', productoId: '', query: 'cafe', cantidad: 2 });
    assert.equal(q.finalAmount, 360);
    assert.equal(f.llamadas.length, 2);
    const busq = JSON.parse(f.llamadas[0].init.body);
    assert.deepEqual(busq.merchantPreference, { mode: 'ONLY', merchantName: 'Blend Station' });
    const cot = JSON.parse(f.llamadas[1].init.body);
    assert.deepEqual(cot.items, [{ variantId: 'var_prd_b', quantity: 2 }]);
    assert.equal(cot.shippingAddress.postalCode, '06600');
    assert.ok(f.llamadas[1].init.headers['Idempotency-Key']);
  } finally { f.restaurar(); }
});

test('ReapReal.cotizar: comercio sin nombre verificado no consulta a Reap', async () => {
  const f = conFetch(() => ({}));
  try {
    await assert.rejects(new ReapReal(cfg).cotizar({ comercio: 'keychron.com', productoId: '', query: 'keyboard', cantidad: 1 }), { code: 'MERCHANT_NOT_RESOLVED' });
    assert.equal(f.llamadas.length, 0);
  } finally { f.restaurar(); }
});

test('ReapReal.crearCheckout (aprobacion): sin header de simulación, devuelve REQUIRES_ACTION con nextAction y no sondea', async () => {
  const f = conFetch(() => ({ id: 'c1', status: 'REQUIRES_ACTION', amount: { amount: 360, currency: 'MXN' }, nextAction: { type: 'REDIRECT', url: 'https://aprobar/x', expiresAt: '2026-10-09T12:15:00Z' } }));
  try {
    const cot = { id: 'q', comercio: 'blendstation.com.mx', productoId: 'p', nombreProducto: 'x', cantidad: 1, moneda: 'MXN', finalAmount: 360, expiresAt: '', paisEnvio: 'MX' };
    const c = await new ReapReal(cfg).crearCheckout(cot);
    assert.equal(c.status, 'REQUIRES_ACTION');
    assert.equal(c.nextAction?.url, 'https://aprobar/x');
    assert.equal(f.llamadas.length, 1);
    assert.equal(JSON.parse(f.llamadas[0].init.body).enrollmentId, 'enr');
    assert.equal(f.llamadas[0].init.headers['X-Simulate-Checkout'], undefined);
  } finally { f.restaurar(); }
});

test('ReapReal.crearCheckout (simulado): local, sin red, orderId sim_', async () => {
  const f = conFetch(() => { throw new Error('no debe llamar a la red'); });
  try {
    const cot = { id: 'q', comercio: 'blendstation.com.mx', productoId: 'p', nombreProducto: 'x', cantidad: 1, moneda: 'MXN', finalAmount: 360, expiresAt: '', paisEnvio: 'MX' };
    const c = await new ReapReal({ ...cfg, modoPago: 'simulado' }).crearCheckout(cot);
    assert.equal(c.status, 'COMPLETED');
    assert.ok(c.orderId?.startsWith('sim_'));
    assert.equal(f.llamadas.length, 0);
  } finally { f.restaurar(); }
});

test('plan real: solo comercios con nombre verificado', async () => {
  const { COMERCIOS } = await import('../src/comercios.ts');
  const plan = armarPlan({ asistentes: 40, presupuestoMXN: 10000 }, true);
  for (const p of plan) for (const i of [p.preferido, ...p.alternativas]) assert.ok(COMERCIOS[i.comercio]?.nombre, i.comercio);
});

test('ReapReal.cotizar: si la variante más barata no tiene stock, prueba la siguiente', async () => {
  let n = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    if (String(url).endsWith('/products/search')) return new Response(JSON.stringify(BUSQUEDA), { status: 200 });
    n += 1;
    return n === 1
      ? new Response(JSON.stringify({ error: { code: 'VARIANT_UNAVAILABLE', message: 'x' } }), { status: 409 })
      : new Response(JSON.stringify(QUOTE), { status: 200 });
  }) as any;
  try {
    const q = await new ReapReal(cfg).cotizar({ comercio: 'blendstation.com.mx', productoId: '', query: 'cafe', cantidad: 50 });
    assert.equal(n, 2);
    assert.equal(q.productoId, 'prd_a'); // el siguiente más barato (300) tras prd_b (200)
  } finally { globalThis.fetch = original; }
});
