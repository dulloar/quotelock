import { mensajeLegible, mxn, porcentaje } from '../formato';
import type { EstadoPartida, Evento, Partida } from '../tipos';
import type { LecturaTimeline } from './leerTimeline';

// Todo lo que la pantalla del evento calcula sale de aquí, y solo de campos del contrato.
// Lo único que viene de leer mensajes (leerTimeline) entra marcado como opcional.

/** Redondeo a centavos: evita que 7150 − 6718.9 se pinte como $431.10000000000036. */
export function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

export function cuantas(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Las tres caras de la pantalla: sin ejecutar, con cobro, o el alto. */
export type Vista = 'borrador' | 'cobro' | 'alto';

export interface Cuentas {
  vista: Vista;
  presupuesto: number;
  techo: number;
  cobrado: number;
  cotizado: number;
  margenTotal: number;
  /** Parte de lo cobrado que cae entre presupuesto y techo. */
  margenUsado: number;
  quedaAntesDelTecho: number;
  /** Cuánto quedó lo cobrado por debajo del presupuesto (0 si lo rebasó). */
  bajoPresupuesto: number;
  /** Cuánto rebasa lo cotizado al techo (0 si cabe). */
  rebasaTecho: number;
  partidas: number;
  cobradas: number;
  cargos: number;
  cambiadas: number;
  detenidas: number;
  pasosHumanos: number;
}

export function cuentas(e: Evento): Cuentas {
  const presupuesto = e.presupuestoMXN;
  const techo = e.techoMXN;
  const cobrado = e.totales.cobradoMXN;
  const cotizado = e.totales.cotizadoMXN;
  const cuenta = (estado: EstadoPartida) => e.partidas.filter((p) => p.estado === estado).length;

  return {
    vista: e.estado === 'borrador' ? 'borrador' : e.estado === 'revision_humana' ? 'alto' : 'cobro',
    presupuesto,
    techo,
    cobrado,
    cotizado,
    margenTotal: centavos(techo - presupuesto),
    margenUsado: centavos(Math.max(0, Math.min(cobrado, techo) - presupuesto)),
    quedaAntesDelTecho: centavos(techo - cobrado),
    bajoPresupuesto: centavos(Math.max(0, presupuesto - cobrado)),
    rebasaTecho: centavos(Math.max(0, cotizado - techo)),
    partidas: e.partidas.length,
    cobradas: e.partidas.filter((p) => p.cobradoMXN !== null && (p.estado === 'pagado' || p.estado === 'ajustado'))
      .length,
    cargos: e.partidas.filter((p) => p.orderId !== null).length,
    cambiadas: cuenta('ajustado'),
    detenidas: cuenta('bloqueado'),
    pasosHumanos: e.timeline.filter((p) => p.actor === 'humano').length,
  };
}

/* ---------- encabezado ---------- */

export interface Encabezado {
  titular: string;
  /** Frases de la entrada; las cifras van aparte para poder resaltarlas. */
  entrada: string;
}

export function encabezado(e: Evento, c: Cuentas): Encabezado {
  if (c.vista === 'borrador') {
    return {
      titular: 'Todavía no lo ejecuto.',
      entrada: `Tengo tu presupuesto de ${mxn(c.presupuesto)} y un margen de ${porcentaje(e.margen)}: mi techo será ${mxn(c.techo)}. No he cotizado ni cobrado nada.`,
    };
  }

  if (c.vista === 'alto') {
    const base =
      c.partidas > 0
        ? `Lo más barato que encontré para ${c.partidas === 1 ? 'la partida' : `las ${c.partidas} partidas`} suma ${mxn(c.cotizado)}.`
        : 'No logré armar un plan que pudiera pagar.';
    const choque =
      c.rebasaTecho > 0 ? ` Tu techo es ${mxn(c.techo)}: se pasa por ${mxn(c.rebasaTecho)}.` : ` Tu techo es ${mxn(c.techo)}.`;
    return { titular: 'Me detuve. Necesito que revises.', entrada: base + choque };
  }

  const todas = c.cobradas === c.partidas;
  const frases: string[] = [];
  frases.push(
    todas
      ? c.partidas === 1
        ? 'Pagué la partida.'
        : `Pagué las ${c.partidas} partidas.`
      : `Pagué ${c.cobradas} de ${cuantas(c.partidas, 'partida', 'partidas')}.`,
  );
  if (c.cambiadas > 0) {
    frases.push(
      c.cambiadas === c.partidas && c.partidas > 1
        ? 'Todas las cambié por una opción más barata.'
        : `Cambié ${c.cambiadas} por una opción más barata.`,
    );
  } else if (todas) {
    frases.push('Todas con la primera opción.');
  }
  if (c.margenUsado > 0) {
    frases.push(`Me pasé ${mxn(c.margenUsado)} del presupuesto, pero dentro del margen que me diste.`);
  } else if (c.bajoPresupuesto > 0) {
    frases.push(`Gasté ${mxn(c.bajoPresupuesto)} menos que tu presupuesto.`);
  } else {
    frases.push('Gasté justo tu presupuesto.');
  }
  if (c.pasosHumanos === 0) frases.push('Nadie tuvo que intervenir.');

  const titular = !todas
    ? `Pagué ${c.cobradas} de ${cuantas(c.partidas, 'partida', 'partidas')}.`
    : c.margenUsado > 0
      ? 'Todo pagado. Usé parte del margen.'
      : 'Todo pagado. Quedó bajo tu presupuesto.';

  return { titular, entrada: frases.join(' ') };
}

/* ---------- cifras de apoyo ---------- */

export interface Apoyo {
  etiqueta: string;
  valor: string;
  nota: string;
  /** Solo la cifra «Frenado por las reglas» lleva el escudo. */
  reglas?: boolean;
}

export function cifrasDeApoyo(e: Evento, c: Cuentas): [Apoyo, Apoyo] {
  const queda: Apoyo = {
    etiqueta: 'Te queda antes del techo',
    valor: mxn(c.quedaAntesDelTecho),
    nota: c.cobrado === 0 ? 'nada gastado' : 'sin tocar',
  };

  if (c.vista === 'borrador') {
    return [queda, { etiqueta: 'Margen que me diste', valor: mxn(c.margenTotal), nota: `${porcentaje(e.margen)} del presupuesto` }];
  }

  // En el alto no se cobró nada: todo lo cotizado quedó frenado. Es lo único que el contrato permite afirmar.
  if (c.vista === 'alto' && c.cobrado === 0) {
    return [
      queda,
      {
        etiqueta: 'Frenado por las reglas',
        valor: mxn(c.cotizado),
        nota: c.detenidas > 0 ? cuantas(c.detenidas, 'partida detenida', 'partidas detenidas') : 'cotizado, sin cobro',
        reglas: true,
      },
    ];
  }

  // Con cobro, el contrato no trae un «monto frenado»: se muestra otra cifra que sí se puede sostener.
  if (c.margenUsado === 0) {
    return [queda, { etiqueta: 'Bajo tu presupuesto', valor: mxn(c.bajoPresupuesto), nota: 'no toqué el margen' }];
  }
  if (c.cambiadas > 0) {
    return [
      queda,
      {
        etiqueta: 'Cambios que hice',
        valor: cuantas(c.cambiadas, 'partida', 'partidas'),
        nota: c.cambiadas === 1 ? 'por una opción más barata' : 'por opciones más baratas',
      },
    ];
  }
  return [
    queda,
    {
      etiqueta: 'Margen usado',
      valor: mxn(c.margenUsado),
      nota: `de ${mxn(c.margenTotal)} (${porcentaje(c.margenUsado / c.margenTotal)})`,
    },
  ];
}

/* ---------- partidas ---------- */

export type Tono = 'cabe' | 'margen' | 'alto' | 'reglas' | 'neutro';

export interface Veredicto {
  tono: Tono;
  palabra: string;
  cuenta: string;
}

export function veredicto(p: Partida, c: Cuentas): Veredicto {
  if (p.estado === 'pendiente') {
    return { tono: 'neutro', palabra: 'Pendiente', cuenta: `todavía no la cotizo. Su tope es ${mxn(p.presupuestadoMXN)}.` };
  }

  const real = p.cobradoMXN ?? p.cotizadoMXN;
  if (real === null) {
    return {
      tono: 'neutro',
      palabra: p.estado === 'bloqueado' ? 'Detenida' : 'No se logró',
      cuenta: `no hay cotización. Su tope es ${mxn(p.presupuestadoMXN)}.`,
    };
  }

  const dif = centavos(real - p.presupuestadoMXN);
  const lado =
    dif === 0 ? 'justo en su tope' : dif < 0 ? `${mxn(-dif)} bajo su tope` : `${mxn(dif)} sobre su tope`;

  if (p.estado === 'bloqueado') {
    const porQue = dif <= 0 && c.rebasaTecho > 0 ? '; se detuvo porque el total rebasa el techo' : '';
    return { tono: 'alto', palabra: 'Detenida', cuenta: `cotizó ${lado}${porQue}.` };
  }
  if (p.estado === 'no_lograda') {
    return { tono: 'neutro', palabra: 'No se logró', cuenta: `cotizó ${lado}; no se cobró.` };
  }
  if (dif <= 0) return { tono: 'cabe', palabra: 'Cabe', cuenta: `${lado}.` };
  return {
    tono: 'margen',
    palabra: 'Sobre su tope',
    cuenta: c.cobrado <= c.techo ? `${mxn(dif)} arriba; el total cabe bajo el techo.` : `${mxn(dif)} arriba.`,
  };
}

export interface Grupo {
  estado: EstadoPartida;
  titulo: string;
  resumen: string;
  /** Posición de cada partida en `evento.partidas`, para cruzarla con lo leído de la línea de tiempo. */
  indices: number[];
}

const ORDEN_GRUPOS: { estado: EstadoPartida; titulo: string }[] = [
  { estado: 'pagado', titulo: 'Pagué tal cual' },
  { estado: 'ajustado', titulo: 'Cambié por una opción más barata' },
  { estado: 'bloqueado', titulo: 'Detenidas, sin cobro' },
  { estado: 'no_lograda', titulo: 'No se lograron' },
  { estado: 'pendiente', titulo: 'Pendientes' },
];

export function grupos(e: Evento): Grupo[] {
  return ORDEN_GRUPOS.map(({ estado, titulo }) => {
    const indices = e.partidas.map((p, i) => (p.estado === estado ? i : -1)).filter((i) => i >= 0);
    return { estado, titulo, resumen: cuantas(indices.length, 'partida', 'partidas'), indices };
  }).filter((g) => g.indices.length > 0);
}

/* ---------- «Esto necesito de ti» ---------- */

export interface Salida {
  titulo: string;
  /** Solo se afirma lo que sale de una cuenta con los datos del evento. */
  nota: string;
}

export function salidas(e: Evento, c: Cuentas): Salida[] {
  if (c.rebasaTecho <= 0) return [];
  const lista: Salida[] = [];

  const mayores = ([0.2, 0.3] as const).filter((m) => m > e.margen);
  if (mayores.length > 0) {
    const alcanza = mayores.find((m) => centavos(c.presupuesto * (1 + m)) >= c.cotizado);
    if (alcanza !== undefined) {
      lista.push({
        titulo: `Subir el margen a ${porcentaje(alcanza)}`,
        nota: `El techo sería ${mxn(centavos(c.presupuesto * (1 + alcanza)))} y los ${mxn(c.cotizado)} cotizados cabrían.`,
      });
    } else {
      const tope = mayores[mayores.length - 1];
      const techoNuevo = centavos(c.presupuesto * (1 + tope));
      lista.push({
        titulo: `Subir el margen a ${porcentaje(tope)}`,
        nota: `No alcanza solo: el techo sería ${mxn(techoNuevo)} y faltarían ${mxn(centavos(c.cotizado - techoNuevo))}.`,
      });
    }
  } else {
    lista.push({
      titulo: 'Subir el presupuesto',
      nota: `Ya tienes el margen máximo. Faltan ${mxn(c.rebasaTecho)} de techo para lo cotizado.`,
    });
  }

  const conCotizacion = e.partidas
    .filter((p): p is Partida & { cotizadoMXN: number } => p.cotizadoMXN !== null)
    .sort((a, b) => a.cotizadoMXN - b.cotizadoMXN);
  if (conCotizacion.length > 1) {
    const basta = conCotizacion.find((p) => centavos(c.cotizado - p.cotizadoMXN) <= c.techo);
    lista.push({
      titulo: 'Quitar una partida',
      nota: basta
        ? `Sin «${basta.nombre}» (${mxn(basta.cotizadoMXN)}) el total bajaría a ${mxn(centavos(c.cotizado - basta.cotizadoMXN))} y cabría.`
        : 'Quitar una sola no alcanza para bajar del techo.',
    });
  }

  return lista;
}

/* ---------- «Así lo hice» ---------- */

export interface PasoClave {
  tipo: 'normal' | 'reglas' | 'alto';
  rotulo?: string;
  texto: string;
}

export function pasosClave(e: Evento, c: Cuentas, lectura: LecturaTimeline): PasoClave[] {
  if (c.vista === 'borrador') return [];
  const pasos: PasoClave[] = [];
  const empieza = (actor: string, inicio: string) =>
    e.timeline.filter((p) => p.actor === actor && p.mensaje.startsWith(inicio));

  pasos.push({
    tipo: 'normal',
    texto: `Armé ${cuantas(c.partidas, 'partida', 'partidas')} para ${cuantas(e.asistentes, 'asistente', 'asistentes')}.`,
  });

  const cotizo = empieza('agente', 'Cotizó ').length;
  if (cotizo > 0) {
    pasos.push({
      tipo: 'normal',
      texto:
        lectura.primeraCotizacionMXN !== null
          ? `Coticé ${cuantas(cotizo, 'partida', 'partidas')}: ${mxn(lectura.primeraCotizacionMXN)} con la primera opción.`
          : `Coticé ${cuantas(cotizo, 'partida', 'partidas')}.`,
    });
  }

  const pidieron = e.timeline.filter((p) => p.actor === 'reglas' && p.mensaje.includes('rebasa su tope')).length;
  if (pidieron > 0) {
    pasos.push({
      tipo: 'reglas',
      rotulo: 'Reglas: pidieron alternativa',
      texto:
        pidieron === 1 ? '1 partida rebasaba su tope.' : `${pidieron} partidas rebasaban su tope.`,
    });
  }

  const replaneo = empieza('agente', 'Replaneó ').length;
  if (replaneo > 0) {
    pasos.push({
      tipo: 'normal',
      texto: `Cambié ${cuantas(replaneo, 'partida', 'partidas')} por ${replaneo === 1 ? 'una opción más barata' : 'opciones más baratas'}: el total quedó en ${mxn(c.cotizado)}.`,
    });
  }

  // La validación del total se cita tal cual la escribieron las reglas.
  const validacion = empieza('reglas', 'El total ')[0];
  pasos.push({
    tipo: 'reglas',
    rotulo: c.vista === 'alto' ? 'Reglas: bloqueado' : 'Reglas: aprobado',
    texto: validacion
      ? `${mensajeLegible(validacion.mensaje)}.`
      : `Total de ${mxn(c.cotizado)} contra un techo de ${mxn(c.techo)}.`,
  });

  if (c.cargos === 0) {
    pasos.push({ tipo: c.vista === 'alto' ? 'alto' : 'normal', rotulo: 'Alto', texto: 'Me detuve antes de pagar: 0 cargos.' });
  } else {
    pasos.push({ tipo: 'normal', texto: `Pagué ${cuantas(c.cargos, 'cargo', 'cargos')}: ${mxn(c.cobrado)}.` });
  }

  return pasos;
}

/** «Nadie tuvo que intervenir» solo si de verdad nadie intervino y no se está pidiendo que alguien lo haga. */
export function nadieIntervino(c: Cuentas): boolean {
  return c.vista === 'cobro' && c.pasosHumanos === 0;
}

/* ---------- la barra ---------- */

export interface Barra {
  /** Posiciones en % sobre una sola escala: de $0 al mayor entre techo, cobrado y cotizado. */
  presupuesto: number;
  techo: number;
  cobradoEnPresupuesto: number;
  cobradoEnMargen: number;
  /** Solo en el alto: lo cotizado sin cobrar, hasta el muro y del otro lado. */
  cotizadoHastaTecho: number;
  cotizadoFuera: number;
  hayFuera: boolean;
  aria: string;
}

export function barra(c: Cuentas): Barra {
  const mostrado = c.cobrado > 0 ? c.cobrado : c.vista === 'alto' ? c.cotizado : 0;
  const escala = Math.max(c.techo, mostrado, 1);
  const pct = (n: number) => (n / escala) * 100;
  const sinCobro = c.vista === 'alto' && c.cobrado === 0 && c.cotizado > 0;

  let aria = `Cobrado: ${mxn(c.cobrado)}. Presupuesto: ${mxn(c.presupuesto)}. Techo: ${mxn(c.techo)}. El margen va de ${mxn(c.presupuesto)} a ${mxn(c.techo)}`;
  if (sinCobro) {
    aria +=
      c.rebasaTecho > 0
        ? `. Lo cotizado, ${mxn(c.cotizado)}, rebasa el techo por ${mxn(c.rebasaTecho)} y no se cobró.`
        : `. Lo cotizado, ${mxn(c.cotizado)}, no se cobró.`;
  } else if (c.margenUsado > 0) {
    aria += ` y se usaron ${mxn(c.margenUsado)} de sus ${mxn(c.margenTotal)}.`;
  } else {
    aria += ' y no se tocó.';
  }

  return {
    presupuesto: pct(c.presupuesto),
    techo: pct(c.techo),
    cobradoEnPresupuesto: pct(Math.min(c.cobrado, c.presupuesto)),
    cobradoEnMargen: pct(Math.max(0, Math.min(c.cobrado, escala) - c.presupuesto)),
    cotizadoHastaTecho: sinCobro ? pct(Math.min(c.cotizado, c.techo)) : 0,
    cotizadoFuera: sinCobro ? pct(Math.max(0, c.cotizado - c.techo)) : 0,
    hayFuera: escala > c.techo,
    aria,
  };
}
