import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { crearServidor } from '../src/app.ts';
import { ReapSimulado } from '../src/reap.ts';

test('HTTP: lista vacía, validación 400, 404, CORS y flujo crear/ejecutar', async () => {
  const srv = crearServidor({ reap: new ReapSimulado(), ahora: () => new Date(), fx: 18.5 });
  await new Promise<void>((r) => srv.listen(0, r));
  const base = `http://localhost:${(srv.address() as AddressInfo).port}`;
  try {
    assert.deepEqual(await (await fetch(`${base}/api/eventos`)).json(), []);
    const op = await fetch(`${base}/api/eventos`, { method: 'OPTIONS' });
    assert.equal(op.status, 204);
    assert.equal(op.headers.get('access-control-allow-origin'), '*');
    const mal = await fetch(`${base}/api/eventos`, { method: 'POST', body: JSON.stringify({ nombre: 'x', fecha: '2026-10-24', asistentes: 40, presupuestoMXN: 1000, margen: 0.5 }) });
    assert.equal(mal.status, 400);
    assert.ok((await mal.json() as { error: string }).error);
    assert.equal((await fetch(`${base}/api/eventos/evt_99`)).status, 404);
    const c = await fetch(`${base}/api/eventos`, { method: 'POST', body: JSON.stringify({ nombre: 'W', fecha: '2026-10-24', asistentes: 40, presupuestoMXN: 30000, margen: 0.1 }) });
    const ev = await c.json() as { id: string; modoSimulado: boolean };
    assert.equal(c.status, 201);
    assert.equal(ev.modoSimulado, true);
    const ej = await (await fetch(`${base}/api/eventos/${ev.id}/ejecutar`, { method: 'POST' })).json() as { estado: string };
    assert.equal(ej.estado, 'pagado');
  } finally {
    srv.close();
  }
});
