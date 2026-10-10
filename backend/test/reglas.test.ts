import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reglaTecho, reglaComercio, reglaVigencia, reglaCobroDoble, calcularTecho, aMXN } from '../src/reglas.ts';

test('techo = presupuesto x (1 + margen)', () => {
  assert.equal(calcularTecho(25000, 0.2), 30000);
});

test('cabe: total dentro del presupuesto', () => {
  const r = reglaTecho(24000, 25000, 0.2);
  assert.equal(r.ok, true);
  assert.equal(r.uso, 'presupuesto');
});

test('cabe solo con margen: excede presupuesto pero no el techo', () => {
  const r = reglaTecho(27400, 25000, 0.2);
  assert.equal(r.ok, true);
  assert.equal(r.uso, 'margen');
});

test('rebasa el margen: excede el techo', () => {
  const r = reglaTecho(30000.01, 25000, 0.2);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /rebasa/);
});

test('comercio no permitido', () => {
  const r = reglaComercio('amazon.com', 'MX');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /lista permitida/);
  assert.equal(reglaComercio('keychron.com', 'MX').ok, true);
  assert.equal(reglaComercio('keychron.com', 'US').ok, false);
  assert.equal(reglaComercio('harney.com', 'MX', 'Wine tasting set').ok, false);
});

test('cotización vencida', () => {
  const ahora = new Date('2026-10-09T12:00:00Z');
  assert.equal(reglaVigencia('2026-10-09T11:59:59Z', ahora).ok, false);
  assert.equal(reglaVigencia('2026-10-09T12:00:00Z', ahora).ok, false);
  assert.equal(reglaVigencia('2026-10-09T12:05:00Z', ahora).ok, true);
});

test('cobro doble', () => {
  for (const s of ['REQUIRES_ACTION', 'PROCESSING', 'COMPLETED']) assert.equal(reglaCobroDoble([s]).ok, false, s);
  assert.equal(reglaCobroDoble(['FAILED', 'EXPIRED']).ok, true);
  assert.equal(reglaCobroDoble([]).ok, true);
});

test('conversión a MXN guarda el tipo de cambio', () => {
  assert.deepEqual(aMXN(10, 'USD', 18.5), { montoMXN: 185, tipoCambio: 18.5 });
  assert.deepEqual(aMXN(300, 'MXN', 18.5), { montoMXN: 300, tipoCambio: 1 });
});
