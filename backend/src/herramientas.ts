// Herramientas del agente: UNA sola definición, expuesta por MCP (src/mcp.ts).
// El LLM propone; el motor de reglas (reglas.ts + pagar) decide. Nada aquí crea un checkout sin pasar por `pagar`.
import type { Evento, Actor, Partida } from './tipos.ts';
import { redondear } from './tipos.ts';
import type { Store, Interno, EstadoAgente } from './store.ts';
import type { Deps } from './orquestador.ts';
import { pagar } from './orquestador.ts';
import { ReapError } from './reap.ts';
import { COMERCIOS } from './comercios.ts';
import { CATALOGO } from './catalogo.ts';
import { aMXN, evaluar, reglaComercio, reglaTecho } from './reglas.ts';
import type { PartidaPlan } from './plan.ts';
import { validarBrief } from './validacion.ts';

export const MAX_PARTIDAS = 6;
export const MAX_LLAMADAS = 25;
const CODIGOS_EXISTENCIAS = ['VARIANT_UNAVAILABLE', 'QUOTE_UNFULFILLABLE', 'AGENTIC_REQUEST_REJECTED'];

export interface Ctx {
  deps: Deps;
  store: Store;
  // true cuando la invoca el agente propio (que ya tiene tomado interno.ejecutando).
  desdeAgente: boolean;
}

export class ErrorHerramienta extends Error {}

export interface Herramienta {
  nombre: string;
  descripcion: string;
  // JSON Schema de los argumentos (sin evento_id; mcp.ts lo agrega o lo fija).
  esquema: { properties: Record<string, unknown>; required: string[] };
  requiereEvento: boolean;
  cuentaLlamada: boolean;
  handler: (ctx: Ctx, evento: Evento, args: Record<string, unknown>) => Promise<unknown>;
}

// ------------------------------------------------------------------ utilidades
export function estadoAgente(interno: Interno): EstadoAgente {
  return (interno.llm ??= { llamadas: 0, cargosCreados: false, cerrado: false, items: {}, variantes: {} });
}

function recortar(s: unknown, n = 200): string {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
}

export function log(ctx: Ctx, evento: Evento, actor: Actor, mensaje: string): void {
  evento.timeline.push({ hora: ctx.deps.ahora().toISOString(), actor, mensaje });
}

function totalPlan(evento: Evento): number {
  return redondear(evento.partidas.reduce((s, p) => s + (p.cotizadoMXN ?? 0), 0));
}

function resumenPlan(evento: Evento) {
  const total = totalPlan(evento);
  evento.totales.cotizadoMXN = total;
  return {
    total_acumulado_mxn: total,
    presupuesto_mxn: evento.presupuestoMXN,
    techo_mxn: evento.techoMXN,
    margen_restante_mxn: redondear(evento.techoMXN - total),
    restante_hasta_presupuesto_mxn: redondear(evento.presupuestoMXN - total),
    excede_techo: total > evento.techoMXN,
  };
}

function texto(args: Record<string, unknown>, campo: string, max = 300): string {
  const v = args[campo];
  if (typeof v !== 'string' || !v.trim()) throw new ErrorHerramienta(`${campo} es requerido (texto)`);
  return v.trim().slice(0, max);
}

function exigirBorrador(ctx: Ctx, evento: Evento): Interno {
  const interno = ctx.store.interno(evento.id);
  if (evento.estado !== 'borrador') throw new ErrorHerramienta(`El evento ya está en estado ${evento.estado}; no admite más cambios`);
  if (interno.ejecutando && !ctx.desdeAgente) throw new ErrorHerramienta('El evento se está ejecutando por otra vía; intenta más tarde');
  return interno;
}

export function cerrarRevision(ctx: Ctx, evento: Evento, motivo: string, actor: Actor): void {
  const interno = ctx.store.interno(evento.id);
  evento.estado = 'revision_humana';
  for (const p of evento.partidas) if (p.estado === 'pendiente') p.estado = 'bloqueado';
  estadoAgente(interno).cerrado = true;
  const total = totalPlan(evento);
  evento.totales.cotizadoMXN = total;
  evento.totales.costoPorAsistenteMXN = redondear(total / evento.asistentes);
  log(ctx, evento, actor, `${motivo}. No se creó ningún checkout; el evento pasa a revisión humana`);
}

export function crearEvento(deps: Deps, store: Store, brief: { nombre: string; fecha: string; asistentes: number; presupuestoMXN: number; margen: 0.1 | 0.2 | 0.3; notas?: string }): Evento {
  const evento: Evento = {
    id: store.siguienteId(),
    nombre: brief.nombre,
    fecha: brief.fecha,
    asistentes: brief.asistentes,
    presupuestoMXN: brief.presupuestoMXN,
    margen: brief.margen,
    techoMXN: redondear(brief.presupuestoMXN * (1 + brief.margen)),
    agente: 'determinista',
    modeloAgente: null,
    estado: 'borrador',
    modoSimulado: deps.reap.modoSimulado || deps.reap.modoPago === 'simulado',
    modoPago: deps.reap.modoPago,
    totales: { presupuestadoMXN: brief.presupuestoMXN, cotizadoMXN: 0, cobradoMXN: 0, costoPorAsistenteMXN: 0 },
    partidas: [],
    timeline: [],
  };
  if (brief.notas !== undefined) evento.notas = brief.notas;
  store.guardar(evento);
  return evento;
}

const VENDE: Record<string, string> = {
  'blendstation.com.mx': 'café de especialidad',
  'acteck.com': 'computación y periféricos (mouse, teclados, accesorios)',
  'balamrush.com': 'por descubrir con buscar_productos',
  'baronfig.com': 'papelería y libretas',
  'mossery.co': 'planners y agendas',
  'stationerypal.com': 'papelería (notepads, memo pads, libretas)',
  'levainbakery.com': 'galletas y postres',
  'keychron.com': 'teclados mecánicos',
  'twelvesouth.com': 'accesorios y cargadores',
  'satechi.net': 'hubs USB-C y accesorios',
  'deathwishcoffee.com': 'café',
  'harney.com': 'té',
};

function comerciosDisponibles(deps: Deps): string[] {
  return Object.keys(COMERCIOS).filter((d) => (deps.reap.modoSimulado ? CATALOGO.some((p) => p.comercio === d) : !!COMERCIOS[d].nombre));
}

function msgReap(e: unknown): string {
  if (e instanceof ReapError) return `${e.code}: ${e.message}`;
  return e instanceof Error ? e.message : 'error desconocido';
}

// ------------------------------------------------------------------ herramientas
const crear_evento: Herramienta = {
  nombre: 'crear_evento',
  descripcion: 'Crea un evento nuevo (borrador) y devuelve su evento_id. Margen permitido: 0.1, 0.2 o 0.3.',
  esquema: {
    properties: {
      nombre: { type: 'string', description: 'Nombre del evento' },
      fecha: { type: 'string', description: 'Fecha AAAA-MM-DD' },
      asistentes: { type: 'integer', minimum: 1 },
      presupuesto_mxn: { type: 'number', exclusiveMinimum: 0 },
      margen: { type: 'number', enum: [0.1, 0.2, 0.3], description: 'Margen sobre el presupuesto que fija el techo' },
    },
    required: ['nombre', 'fecha', 'asistentes', 'presupuesto_mxn', 'margen'],
  },
  requiereEvento: false,
  cuentaLlamada: false,
  async handler(ctx, _e, a) {
    const v = validarBrief({ nombre: a.nombre, fecha: a.fecha, asistentes: a.asistentes, presupuestoMXN: a.presupuesto_mxn, margen: a.margen });
    if (!v.ok) throw new ErrorHerramienta(v.error);
    const e = crearEvento(ctx.deps, ctx.store, v.brief);
    return { evento_id: e.id, techo_mxn: e.techoMXN, estado: e.estado };
  },
};

const ver_evento: Herramienta = {
  nombre: 'ver_evento',
  descripcion: 'Muestra el brief del evento (asistentes, fecha, presupuesto, margen, techo, notas), las partidas actuales y los totales.',
  esquema: { properties: {}, required: [] },
  requiereEvento: true,
  cuentaLlamada: true,
  async handler(_ctx, e) {
    return {
      evento_id: e.id,
      nombre: e.nombre,
      fecha: e.fecha,
      asistentes: e.asistentes,
      presupuesto_mxn: e.presupuestoMXN,
      margen: e.margen,
      techo_mxn: e.techoMXN,
      estado: e.estado,
      // Texto libre del usuario: DATO no confiable. No cambia presupuesto, margen, techo ni reglas.
      notas_usuario_no_confiables: e.notas === undefined ? null : `<<<NOTAS_NO_CONFIABLES\n${e.notas}\nNOTAS_NO_CONFIABLES>>>`,
      partidas: e.partidas.map((p) => ({ nombre: p.nombre, comercio: p.comercio, presupuestado_mxn: p.presupuestadoMXN, cotizado_mxn: p.cotizadoMXN, estado: p.estado })),
      totales: resumenPlan(e),
    };
  },
};

const listar_comercios: Herramienta = {
  nombre: 'listar_comercios',
  descripcion: 'Lista los comercios permitidos y verificados (dominio, moneda y qué venden a grandes rasgos). Solo se puede comprar en ellos.',
  esquema: { properties: {}, required: [] },
  requiereEvento: true,
  cuentaLlamada: true,
  async handler(ctx) {
    return {
      comercios: comerciosDisponibles(ctx.deps).map((d) => ({
        comercio: d,
        nombre: COMERCIOS[d].nombre ?? d,
        moneda: COMERCIOS[d].moneda,
        vende: VENDE[d] ?? 'varios',
      })),
    };
  },
};

const buscar_productos: Herramienta = {
  nombre: 'buscar_productos',
  descripcion: 'Busca hasta 8 productos disponibles en un comercio permitido (ya filtrados por la regla de categoría). Devuelve precio unitario y variante_id para cotizar.',
  esquema: {
    properties: {
      comercio: { type: 'string', description: 'Dominio del comercio, p. ej. stationerypal.com' },
      consulta: { type: 'string', description: 'Texto de búsqueda (en inglés suele funcionar mejor)' },
    },
    required: ['comercio', 'consulta'],
  },
  requiereEvento: true,
  cuentaLlamada: true,
  async handler(ctx, e, a) {
    const interno = ctx.store.interno(e.id);
    const comercio = texto(a, 'comercio').toLowerCase();
    const consulta = texto(a, 'consulta', 100);
    if (!comerciosDisponibles(ctx.deps).includes(comercio)) throw new ErrorHerramienta(`El comercio ${comercio} no está permitido. Usa listar_comercios.`);
    let productos;
    try {
      productos = await ctx.deps.reap.buscar(comercio, consulta);
    } catch (err) {
      throw new ErrorHerramienta(`La búsqueda falló: ${msgReap(err)}`);
    }
    const ll = estadoAgente(interno);
    for (const p of productos) ll.variantes[`${comercio}|${p.varianteId}`] = { comercio, nombre: p.nombre, precio: p.precio, moneda: p.moneda };
    return {
      comercio,
      productos: productos.map((p) => ({ nombre: p.nombre, precio_unitario: p.precio, moneda: p.moneda, variante_id: p.varianteId })),
    };
  },
};

const cotizar_partida: Herramienta = {
  nombre: 'cotizar_partida',
  descripcion:
    'Cotiza (con envío e impuestos, convertido a MXN) una cantidad de una variante y la guarda como partida del plan; si ya existe una partida con ese nombre sin cargo, la reemplaza. Devuelve total, vencimiento, total acumulado, techo y margen restante. Si no hay existencias devuelve un error: reduce la cantidad o cambia de producto.',
  esquema: {
    properties: {
      nombre_partida: { type: 'string', description: 'Nombre de la partida, p. ej. "Café"' },
      comercio: { type: 'string' },
      variante_id: { type: 'string', description: 'variante_id devuelto por buscar_productos' },
      cantidad: { type: 'integer', minimum: 1, maximum: 200 },
      motivo: { type: 'string', description: 'Una frase: por qué esta partida y esta cantidad' },
      presupuesto_partida_mxn: { type: 'number', description: 'Opcional: tope que le asignas a la partida; si falta se usa lo cotizado' },
    },
    required: ['nombre_partida', 'comercio', 'variante_id', 'cantidad', 'motivo'],
  },
  requiereEvento: true,
  cuentaLlamada: true,
  async handler(ctx, e, a) {
    const interno = exigirBorrador(ctx, e);
    const ll = estadoAgente(interno);
    const nombre = texto(a, 'nombre_partida', 80);
    const comercio = texto(a, 'comercio').toLowerCase();
    const varianteId = texto(a, 'variante_id', 200);
    const motivo = recortar(texto(a, 'motivo', 400));
    const cantidad = a.cantidad;
    if (typeof cantidad !== 'number' || !Number.isInteger(cantidad) || cantidad < 1 || cantidad > 200) throw new ErrorHerramienta('cantidad debe ser un entero entre 1 y 200');
    let presupuestado: number | null = null;
    if (a.presupuesto_partida_mxn !== undefined) {
      if (typeof a.presupuesto_partida_mxn !== 'number' || !Number.isFinite(a.presupuesto_partida_mxn) || a.presupuesto_partida_mxn <= 0) throw new ErrorHerramienta('presupuesto_partida_mxn debe ser un número positivo');
      presupuestado = redondear(a.presupuesto_partida_mxn);
    }
    const idx = e.partidas.findIndex((p) => p.nombre === nombre);
    if (idx >= 0 && e.partidas[idx].estado !== 'pendiente') throw new ErrorHerramienta(`La partida ${nombre} ya tiene cargo; no se puede reemplazar`);
    if (idx < 0 && e.partidas.length >= MAX_PARTIDAS) throw new ErrorHerramienta(`Máximo ${MAX_PARTIDAS} partidas por evento; quita una con quitar_partida`);
    const variante = ll.variantes[`${comercio}|${varianteId}`];
    const rc = reglaComercio(comercio, 'MX', variante?.nombre ?? '');
    if (!rc.ok || !comerciosDisponibles(ctx.deps).includes(comercio)) {
      log(ctx, e, 'reglas', `Bloqueó cotizar ${nombre} en ${comercio}: ${rc.ok ? 'comercio no disponible' : rc.motivo}`);
      throw new ErrorHerramienta(rc.ok ? `El comercio ${comercio} no está disponible` : rc.motivo);
    }
    if (!variante) throw new ErrorHerramienta('variante_id desconocido: primero búscala con buscar_productos en ese comercio');
    let cot;
    try {
      cot = await ctx.deps.reap.cotizar({ comercio, productoId: varianteId, varianteId, query: variante.nombre, cantidad });
    } catch (err) {
      const code = err instanceof ReapError ? err.code : 'ERROR';
      log(ctx, e, 'agente', `No se pudo cotizar ${nombre} (${cantidad} u.) en ${comercio}: ${code}`);
      if (CODIGOS_EXISTENCIAS.includes(code)) throw new ErrorHerramienta(`Sin existencias o no se puede surtir ${cantidad} unidades (${code}). Reduce la cantidad o cambia de producto.`);
      throw new ErrorHerramienta(`No se pudo cotizar: ${msgReap(err)}`);
    }
    const { montoMXN, tipoCambio } = aMXN(cot.finalAmount, cot.moneda, ctx.deps.fx);
    const partida: Partida = {
      nombre, comercio, presupuestadoMXN: presupuestado ?? montoMXN, cotizadoMXN: montoMXN, cobradoMXN: null, estado: 'pendiente',
      orderId: null, tipoCambio, checkoutId: null, urlAprobacion: null, aprobacionExpira: null,
    };
    if (idx >= 0) e.partidas[idx] = partida;
    else e.partidas.push(partida);
    ll.items[nombre] = {
      item: { comercio, productoId: varianteId, varianteId, query: variante.nombre, cantidad, descripcion: `${cantidad} x ${variante.nombre}` },
      cot, mxn: montoMXN, tc: tipoCambio, presupuestadoMXN: partida.presupuestadoMXN,
    };
    log(ctx, e, 'agente', `Cotizó ${nombre}: ${cantidad} x ${variante.nombre} en ${comercio} = ${montoMXN} MXN. ${motivo}`);
    const plan = resumenPlan(e);
    return { partida: nombre, cantidad, total_mxn: montoMXN, vence: cot.expiresAt, ...plan };
  },
};

const quitar_partida: Herramienta = {
  nombre: 'quitar_partida',
  descripcion: 'Quita una partida que aún no tiene cargo.',
  esquema: {
    properties: { nombre_partida: { type: 'string' }, motivo: { type: 'string', description: 'Una frase' } },
    required: ['nombre_partida', 'motivo'],
  },
  requiereEvento: true,
  cuentaLlamada: true,
  async handler(ctx, e, a) {
    const interno = exigirBorrador(ctx, e);
    const nombre = texto(a, 'nombre_partida', 80);
    const motivo = recortar(texto(a, 'motivo', 400));
    const idx = e.partidas.findIndex((p) => p.nombre === nombre);
    if (idx < 0) throw new ErrorHerramienta(`No existe la partida ${nombre}`);
    if (e.partidas[idx].estado !== 'pendiente') throw new ErrorHerramienta(`La partida ${nombre} ya tiene cargo`);
    e.partidas.splice(idx, 1);
    delete estadoAgente(interno).items[nombre];
    log(ctx, e, 'agente', `Quitó la partida ${nombre}. ${motivo}`);
    return { quitada: nombre, ...resumenPlan(e) };
  },
};

const crear_cargos: Herramienta = {
  nombre: 'crear_cargos',
  descripcion:
    'Valida el plan completo con el motor de reglas (techo, comercio, vigencia, no cobro doble) y, solo si todo pasa, crea un cargo por partida. Si el total rebasa el techo no crea nada y explica el motivo. Solo puede tener éxito una vez por evento.',
  esquema: { properties: { resumen: { type: 'string', description: 'Resumen breve del plan y por qué es razonable' } }, required: ['resumen'] },
  requiereEvento: true,
  cuentaLlamada: true,
  async handler(ctx, e, a) {
    const interno = exigirBorrador(ctx, e);
    const ll = estadoAgente(interno);
    const resumen = recortar(texto(a, 'resumen', 600));
    if (ll.cargosCreados) throw new ErrorHerramienta('Los cargos de este evento ya se crearon');
    if (e.partidas.length === 0) throw new ErrorHerramienta('No hay partidas; cotiza al menos una antes de crear cargos');
    const total = totalPlan(e);
    // 1. Validar TODO el plan antes de crear un solo checkout.
    const fallos = new Set<string>();
    const techo = reglaTecho(total, e.presupuestoMXN, e.margen);
    if (!techo.ok) fallos.add(techo.motivo);
    e.partidas.forEach((p, i) => {
      const it = ll.items[p.nombre];
      if (!it) { fallos.add(`${p.nombre}: sin cotización`); return; }
      const r = evaluar({
        comercio: it.cot.comercio, paisEnvio: it.cot.paisEnvio, textoProducto: it.cot.nombreProducto, expiresAt: it.cot.expiresAt,
        ahora: ctx.deps.ahora(), totalPlanMXN: total, presupuestoMXN: e.presupuestoMXN, margen: e.margen, estadosCheckoutPrevios: interno.checkouts[i] ?? [],
      });
      for (const x of r.resultados) if (!x.ok) fallos.add(x.regla === 'vigencia' ? `${p.nombre}: ${x.motivo}; vuelve a cotizarla` : x.motivo);
    });
    if (fallos.size > 0) {
      const motivos = [...fallos].join('; ');
      log(ctx, e, 'reglas', `Bloqueó crear los cargos: ${motivos}. No se creó ningún checkout`);
      throw new ErrorHerramienta(`El motor de reglas bloqueó el plan: ${motivos}. No se creó ningún cargo.`);
    }
    // 2. Crear cargos (única vía: pagar).
    ll.cargosCreados = true;
    log(ctx, e, 'agente', `Plan final: ${resumen}`);
    interno.plan = e.partidas.map((p): PartidaPlan => ({ nombre: p.nombre, presupuestadoMXN: p.presupuestadoMXN, preferido: ll.items[p.nombre].item, alternativas: [] }));
    interno.hayReplan = false;
    let fallo = false;
    for (let i = 0; i < e.partidas.length; i++) {
      const part = e.partidas[i];
      const it = ll.items[part.nombre];
      if (fallo) {
        part.estado = 'bloqueado';
        log(ctx, e, 'reglas', `Pago de ${part.nombre} detenido: un checkout anterior no se completó`);
        continue;
      }
      const r = await pagar(ctx.deps, { presupuestoMXN: e.presupuestoMXN, margen: e.margen, cotizacion: it.cot, totalPlanMXN: total, estadosCheckoutPrevios: interno.checkouts[i] ?? [] });
      if (!r.ok || !r.checkout) {
        fallo = true;
        part.estado = 'bloqueado';
        log(ctx, e, 'reglas', `Pago de ${part.nombre} bloqueado: ${r.resultados.filter((x) => !x.ok).map((x) => x.motivo).join('; ')}`);
        continue;
      }
      (interno.checkouts[i] ??= []).push(r.checkout.status);
      if (r.checkout.status === 'REQUIRES_ACTION' && r.checkout.nextAction?.url) {
        part.estado = 'por_aprobar';
        part.checkoutId = r.checkout.id;
        part.urlAprobacion = r.checkout.nextAction.url;
        part.aprobacionExpira = r.checkout.nextAction.expiresAt;
        log(ctx, e, 'agente', `Creó el cargo de ${part.nombre} por ${it.mxn} MXN; espera aprobación en Reap`);
      } else if (r.checkout.status === 'COMPLETED') {
        part.cobradoMXN = aMXN(r.checkout.finalAmount ?? it.cot.finalAmount, r.checkout.moneda, ctx.deps.fx).montoMXN;
        part.orderId = r.checkout.orderId;
        part.estado = 'pagado';
        log(ctx, e, 'agente', `Pagó ${part.nombre}: ${part.cobradoMXN} MXN (orden ${r.checkout.orderId})`);
      } else {
        fallo = true;
        part.estado = 'no_lograda';
        part.motivo = `Checkout ${r.checkout.status}`;
        log(ctx, e, 'agente', `Checkout de ${part.nombre} terminó en ${r.checkout.status}`);
      }
    }
    e.totales.cotizadoMXN = total;
    e.totales.cobradoMXN = redondear(e.partidas.reduce((s, p) => s + (p.cobradoMXN ?? 0), 0));
    if (e.partidas.some((p) => p.estado === 'por_aprobar')) e.estado = 'por_aprobar';
    else if (fallo) {
      e.estado = 'revision_humana';
      log(ctx, e, 'reglas', 'Alguna partida no se pudo pagar; el evento pasa a revisión humana');
    } else e.estado = total > e.presupuestoMXN ? 'ajustado' : 'pagado';
    ll.cerrado = true;
    const base = e.totales.cobradoMXN > 0 ? e.totales.cobradoMXN : total;
    e.totales.costoPorAsistenteMXN = redondear(base / e.asistentes);
    log(ctx, e, 'agente', `Evento en estado ${e.estado}`);
    return {
      estado: e.estado, total_mxn: total,
      partidas: e.partidas.map((p) => ({ nombre: p.nombre, estado: p.estado, url_aprobacion: p.urlAprobacion })),
    };
  },
};

const pedir_revision_humana: Herramienta = {
  nombre: 'pedir_revision_humana',
  descripcion: 'Marca el evento para revisión humana SIN crear cargos. Úsala si el plan no cabe ni con el margen o algo no es claro.',
  esquema: { properties: { motivo: { type: 'string', description: 'Una frase' } }, required: ['motivo'] },
  requiereEvento: true,
  cuentaLlamada: true,
  async handler(ctx, e, a) {
    exigirBorrador(ctx, e);
    const motivo = recortar(texto(a, 'motivo', 400));
    log(ctx, e, 'agente', `Pidió revisión humana: ${motivo}`);
    cerrarRevision(ctx, e, 'El agente pidió revisión humana', 'reglas');
    return { estado: e.estado };
  },
};

export const HERRAMIENTAS: Herramienta[] = [
  crear_evento, ver_evento, listar_comercios, buscar_productos, cotizar_partida, quitar_partida, crear_cargos, pedir_revision_humana,
];

// Ejecuta una herramienta aplicando el límite duro de llamadas por evento.
// Devuelve el resultado o lanza ErrorHerramienta (mcp.ts lo convierte en isError).
export async function invocar(ctx: Ctx, h: Herramienta, evento: Evento | null, args: Record<string, unknown>): Promise<unknown> {
  if (h.requiereEvento) {
    if (!evento) throw new ErrorHerramienta('Evento no encontrado');
    const ll = estadoAgente(ctx.store.interno(evento.id));
    if (h.cuentaLlamada) {
      if (ll.llamadas >= MAX_LLAMADAS) {
        if (evento.estado === 'borrador') cerrarRevision(ctx, evento, `Se alcanzó el límite de ${MAX_LLAMADAS} llamadas a herramientas`, 'reglas');
        throw new ErrorHerramienta(`Límite de ${MAX_LLAMADAS} llamadas a herramientas alcanzado para este evento`);
      }
      ll.llamadas += 1;
    }
  }
  return h.handler(ctx, evento as Evento, args);
}
