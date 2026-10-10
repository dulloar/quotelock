import type { Evento, Partida, Actor } from './tipos.ts';
import { redondear } from './tipos.ts';
import type { Interno } from './store.ts';
import type { ReapClient, Cotizacion, Checkout } from './reap.ts';
import { ReapError } from './reap.ts';
import { aMXN, evaluar, reglaTecho } from './reglas.ts';
import type { Resultado } from './reglas.ts';
import { armarPlan } from './plan.ts';
import type { ItemPlan } from './plan.ts';

export interface Deps {
  reap: ReapClient;
  ahora: () => Date;
  fx: number; // tipo de cambio USD->MXN SIMULADO
}

export interface ContextoPago {
  presupuestoMXN: number;
  margen: number;
  cotizacion: Cotizacion;
  totalPlanMXN: number; // suma de lo cotizado de TODAS las partidas
  estadosCheckoutPrevios: string[];
}

export interface ResultadoPago {
  ok: boolean;
  resultados: Resultado[];
  checkout?: Checkout;
}

// Única vía a POST checkouts. Si una regla falla, NO existe checkout.
export async function pagar(deps: Deps, ctx: ContextoPago): Promise<ResultadoPago> {
  const { resultados, ok } = evaluar({
    comercio: ctx.cotizacion.comercio,
    paisEnvio: ctx.cotizacion.paisEnvio,
    textoProducto: ctx.cotizacion.nombreProducto,
    expiresAt: ctx.cotizacion.expiresAt,
    ahora: deps.ahora(),
    totalPlanMXN: ctx.totalPlanMXN,
    presupuestoMXN: ctx.presupuestoMXN,
    margen: ctx.margen,
    estadosCheckoutPrevios: ctx.estadosCheckoutPrevios,
  });
  if (!ok) return { ok: false, resultados };
  try {
    const checkout = await deps.reap.crearCheckout(ctx.cotizacion);
    return { ok: true, resultados, checkout };
  } catch (e) {
    // Error de Reap al crear/sondear el checkout: nada se considera cobrado.
    const code = e instanceof ReapError ? e.code : 'ERROR';
    return { ok: true, resultados, checkout: { id: '', status: `ERROR_${code}`, orderId: null, finalAmount: null, moneda: ctx.cotizacion.moneda } };
  }
}

interface Elegida {
  item: ItemPlan;
  cot: Cotizacion;
  mxn: number;
  tc: number;
  replaneada: boolean;
}

export async function ejecutar(deps: Deps, evento: Evento, interno: Interno): Promise<Evento> {
  // Idempotencia: un evento ya ejecutado (o en curso) no se vuelve a cobrar.
  if (evento.estado !== 'borrador' || interno.ejecutando) return evento;
  interno.ejecutando = true;
  const log = (actor: Actor, mensaje: string) => evento.timeline.push({ hora: deps.ahora().toISOString(), actor, mensaje });
  try {
    const plan = armarPlan(evento, !deps.reap.modoSimulado);
    log('agente', `Armó ${plan.length} partidas para ${evento.asistentes} asistentes con presupuesto de ${evento.presupuestoMXN} MXN`);
    const elegidas: (Elegida | null)[] = [];
    evento.partidas = plan.map((p) => ({
      nombre: p.nombre, comercio: p.preferido.comercio, presupuestadoMXN: p.presupuestadoMXN,
      cotizadoMXN: null, cobradoMXN: null, estado: 'pendiente', orderId: null, tipoCambio: null,
    }));

    const cotizar = async (item: ItemPlan): Promise<Elegida | null> => {
      try {
        const cot = await deps.reap.cotizar({ comercio: item.comercio, productoId: item.productoId, query: item.query, cantidad: item.cantidad });
        const { montoMXN, tipoCambio } = aMXN(cot.finalAmount, cot.moneda, deps.fx);
        return { item, cot, mxn: montoMXN, tc: tipoCambio, replaneada: false };
      } catch (e) {
        const code = e instanceof ReapError ? e.code : 'ERROR';
        log('agente', `No se pudo cotizar ${item.descripcion} en ${item.comercio} (${code})`);
        return null;
      }
    };

    // 2. Cotizar y replanear
    for (let i = 0; i < plan.length; i++) {
      const pp = plan[i];
      const part = evento.partidas[i];
      let el = await cotizar(pp.preferido);
      if (el) log('agente', `Cotizó ${pp.preferido.descripcion} en ${el.cot.comercio}: ${el.mxn} MXN (tope de la partida ${pp.presupuestadoMXN} MXN)`);
      if (!el || el.mxn > pp.presupuestadoMXN) {
        if (el) log('reglas', `${pp.nombre} rebasa su tope de ${pp.presupuestadoMXN} MXN; se intenta una alternativa más barata`);
        let mejor: Elegida | null = null;
        for (const alt of pp.alternativas) {
          const a = await cotizar(alt);
          if (!a) continue;
          a.replaneada = true;
          if (!mejor || a.mxn < mejor.mxn) mejor = a;
          if (a.mxn <= pp.presupuestadoMXN) break;
        }
        if (mejor && (!el || mejor.mxn < el.mxn)) {
          log('agente', `Replaneó ${pp.nombre}: ${mejor.item.descripcion} en ${mejor.cot.comercio} por ${mejor.mxn} MXN`);
          el = mejor;
        }
      }
      elegidas.push(el);
      if (el) {
        part.comercio = el.cot.comercio;
        part.cotizadoMXN = el.mxn;
        part.tipoCambio = el.tc;
      } else {
        part.estado = 'no_lograda';
      }
    }

    // 3. Validar el plan completo ANTES de pagar
    const total = redondear(elegidas.reduce((s, e) => s + (e?.mxn ?? 0), 0));
    const hayReplan = elegidas.some((e) => e?.replaneada);
    evento.totales.cotizadoMXN = total;
    const verTecho = reglaTecho(total, evento.presupuestoMXN, evento.margen);
    log('reglas', verTecho.motivo);

    const detener = (motivo: string) => {
      evento.estado = 'revision_humana';
      for (const p of evento.partidas) if (p.estado === 'pendiente') p.estado = 'bloqueado';
      log('reglas', `${motivo}. No se creó ningún checkout; el evento pasa a revisión humana`);
    };

    if (elegidas.some((e) => e === null)) {
      detener('Hay partidas sin cotización posible');
    } else if (!verTecho.ok) {
      detener('El total rebasa el techo aun con las alternativas más baratas');
    } else {
      // 4. Pagar
      let fallo = false;
      for (let i = 0; i < plan.length; i++) {
        const el = elegidas[i]!;
        const part = evento.partidas[i];
        if (fallo && part.estado === 'no_lograda') continue;
        if (fallo && evento.partidas.some((x) => x.estado === 'no_lograda')) {
          // Un checkout ya falló: no se siguen creando cobros hasta que una persona revise.
          part.estado = 'bloqueado';
          log('reglas', `Pago de ${part.nombre} detenido: un checkout anterior no se completó`);
          continue;
        }
        const r = await pagar(deps, {
          presupuestoMXN: evento.presupuestoMXN, margen: evento.margen, cotizacion: el.cot,
          totalPlanMXN: total, estadosCheckoutPrevios: interno.checkouts[i] ?? [],
        });
        if (!r.ok || !r.checkout) {
          fallo = true;
          part.estado = 'bloqueado';
          log('reglas', `Pago de ${part.nombre} bloqueado: ${r.resultados.filter((x) => !x.ok).map((x) => x.motivo).join('; ')}`);
          continue;
        }
        (interno.checkouts[i] ??= []).push(r.checkout.status);
        if (r.checkout.status === 'COMPLETED') {
          const cobrado = aMXN(r.checkout.finalAmount ?? el.cot.finalAmount, r.checkout.moneda, deps.fx).montoMXN;
          part.cobradoMXN = cobrado;
          part.orderId = r.checkout.orderId;
          part.estado = el.replaneada ? 'ajustado' : 'pagado';
          log('agente', `Pagó ${part.nombre} en ${part.comercio}: ${cobrado} MXN (orden ${r.checkout.orderId})`);
        } else {
          fallo = true;
          part.estado = 'no_lograda';
          log('agente', `Checkout de ${part.nombre} terminó en ${r.checkout.status}`);
        }
      }
      evento.totales.cobradoMXN = redondear(evento.partidas.reduce((s, p) => s + (p.cobradoMXN ?? 0), 0));
      if (fallo) {
        evento.estado = 'revision_humana';
        log('reglas', 'Alguna partida no se pudo pagar; el evento pasa a revisión humana');
      } else if (hayReplan || total > evento.presupuestoMXN) {
        evento.estado = 'ajustado';
      } else {
        evento.estado = 'pagado';
      }
    }

    const base = evento.totales.cobradoMXN > 0 ? evento.totales.cobradoMXN : total;
    evento.totales.costoPorAsistenteMXN = redondear(base / evento.asistentes);
    log('agente', `Evento en estado ${evento.estado}`);
    return evento;
  } finally {
    interno.ejecutando = false;
  }
}
