import { COMERCIOS, PALABRAS_PROHIBIDAS } from './comercios.ts';
import { redondear } from './tipos.ts';

export interface Resultado {
  regla: string;
  ok: boolean;
  motivo: string;
}

const EPS = 0.005;

export function calcularTecho(presupuestoMXN: number, margen: number): number {
  return redondear(presupuestoMXN * (1 + margen));
}

export function aMXN(monto: number, moneda: string, fxUsdMxn: number): { montoMXN: number; tipoCambio: number } {
  if (moneda === 'MXN') return { montoMXN: redondear(monto), tipoCambio: 1 };
  if (moneda === 'USD') return { montoMXN: redondear(monto * fxUsdMxn), tipoCambio: fxUsdMxn };
  throw new Error(`Moneda no soportada: ${moneda}`);
}

export interface ResultadoTecho extends Resultado {
  uso: 'presupuesto' | 'margen' | 'rebasa';
}

// La suma de lo cotizado de TODAS las partidas debe ser <= techo.
export function reglaTecho(totalPlanMXN: number, presupuestoMXN: number, margen: number): ResultadoTecho {
  const techo = calcularTecho(presupuestoMXN, margen);
  if (totalPlanMXN <= presupuestoMXN + EPS)
    return { regla: 'techo', ok: true, uso: 'presupuesto', motivo: `El total ${totalPlanMXN} MXN cabe en el presupuesto de ${presupuestoMXN} MXN` };
  if (totalPlanMXN <= techo + EPS)
    return { regla: 'techo', ok: true, uso: 'margen', motivo: `El total ${totalPlanMXN} MXN excede el presupuesto pero cabe en el techo de ${techo} MXN (margen ${margen * 100}%)` };
  return { regla: 'techo', ok: false, uso: 'rebasa', motivo: `El total ${totalPlanMXN} MXN rebasa el techo de ${techo} MXN (margen ${margen * 100}%)` };
}

export function reglaComercio(comercio: string, paisEnvio: string, textoProducto = ''): Resultado {
  const c = COMERCIOS[comercio.toLowerCase()];
  if (!c) return { regla: 'comercio', ok: false, motivo: `El comercio ${comercio} no está en la lista permitida` };
  if (paisEnvio !== 'MX' || !c.enviaAMX) return { regla: 'comercio', ok: false, motivo: `${comercio} no envía a ${paisEnvio}; se requiere envío a MX` };
  const t = ` ${textoProducto.toLowerCase()} `;
  const prohibida = PALABRAS_PROHIBIDAS.find((p) => t.includes(p));
  if (prohibida) return { regla: 'comercio', ok: false, motivo: `Categoría prohibida (alcohol o viajes): "${prohibida.trim()}"` };
  return { regla: 'comercio', ok: true, motivo: `${comercio} está permitido y envía a MX` };
}

export function reglaVigencia(expiresAt: string, ahora: Date): Resultado {
  const exp = Date.parse(expiresAt);
  if (Number.isNaN(exp)) return { regla: 'vigencia', ok: false, motivo: 'La cotización no tiene fecha de vencimiento válida' };
  if (ahora.getTime() < exp) return { regla: 'vigencia', ok: true, motivo: 'La cotización está vigente' };
  return { regla: 'vigencia', ok: false, motivo: `La cotización venció el ${expiresAt}` };
}

const ESTADOS_BLOQUEANTES = ['REQUIRES_ACTION', 'PROCESSING', 'COMPLETED'];

export function reglaCobroDoble(estadosCheckoutPrevios: string[]): Resultado {
  const b = estadosCheckoutPrevios.find((s) => ESTADOS_BLOQUEANTES.includes(s));
  if (b) return { regla: 'cobro_doble', ok: false, motivo: `La partida ya tiene un checkout en ${b}; no se cobra dos veces` };
  return { regla: 'cobro_doble', ok: true, motivo: 'La partida no tiene checkouts activos ni completados' };
}

export interface EntradaEvaluacion {
  comercio: string;
  paisEnvio: string;
  textoProducto?: string;
  expiresAt: string;
  ahora: Date;
  totalPlanMXN: number;
  presupuestoMXN: number;
  margen: number;
  estadosCheckoutPrevios: string[];
}

export function evaluar(e: EntradaEvaluacion): { ok: boolean; resultados: Resultado[] } {
  const resultados: Resultado[] = [
    reglaComercio(e.comercio, e.paisEnvio, e.textoProducto),
    reglaVigencia(e.expiresAt, e.ahora),
    reglaTecho(e.totalPlanMXN, e.presupuestoMXN, e.margen),
    reglaCobroDoble(e.estadosCheckoutPrevios),
  ];
  return { ok: resultados.every((r) => r.ok), resultados };
}
