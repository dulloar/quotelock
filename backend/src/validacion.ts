import type { Brief, Margen } from './tipos.ts';
import { MARGENES_VALIDOS } from './tipos.ts';

export function validarBrief(x: unknown): { ok: true; brief: Brief } | { ok: false; error: string } {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return { ok: false, error: 'El brief debe ser un objeto JSON' };
  const b = x as Record<string, unknown>;
  if (typeof b.nombre !== 'string' || !b.nombre.trim()) return { ok: false, error: 'nombre es requerido' };
  if (typeof b.fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(b.fecha)) return { ok: false, error: 'fecha debe tener formato AAAA-MM-DD' };
  if (typeof b.asistentes !== 'number' || !Number.isInteger(b.asistentes) || b.asistentes <= 0)
    return { ok: false, error: 'asistentes debe ser un entero positivo' };
  if (typeof b.presupuestoMXN !== 'number' || !Number.isFinite(b.presupuestoMXN) || b.presupuestoMXN <= 0)
    return { ok: false, error: 'presupuestoMXN debe ser un número positivo' };
  if (typeof b.margen !== 'number' || !MARGENES_VALIDOS.includes(b.margen))
    return { ok: false, error: 'margen debe ser 0.1, 0.2 o 0.3' };
  if (b.notas !== undefined && typeof b.notas !== 'string') return { ok: false, error: 'notas debe ser texto' };
  const brief: Brief = {
    nombre: b.nombre.trim(),
    fecha: b.fecha,
    asistentes: b.asistentes,
    presupuestoMXN: b.presupuestoMXN,
    margen: b.margen as Margen,
  };
  if (typeof b.notas === 'string') brief.notas = b.notas; // se guarda, nunca influye en reglas ni montos
  return { ok: true, brief };
}
