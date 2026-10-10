import type { EntradaTimeline, Partida } from '../tipos';

/*
 * FRÁGIL A PROPÓSITO.
 *
 * El contrato no trae «qué se compró» ni «qué opción se descartó» de cada partida: ese dato
 * solo existe como texto libre dentro de los mensajes de la línea de tiempo. Aquí se intenta
 * leerlo con dos patrones del backend de hoy:
 *
 *   «Cotizó <cosa> en <comercio>: <N> MXN (tope de la partida <T> MXN)»
 *   «Replaneó <partida>: <cosa> en <comercio> por <N> MXN»
 *
 * Si el backend cambia una palabra, esto deja de casar y devuelve «no sé» (null / mapa vacío).
 * La pantalla está hecha para funcionar igual sin este dato: es un adorno informativo, nunca
 * la fuente de una cifra. Todo lo que se lee se coteja contra los campos del contrato
 * (comercio, cotizadoMXN, presupuestadoMXN); si no cuadra, se descarta en vez de mostrarse.
 *
 * No agregar aquí lógica de negocio ni «arreglar» mensajes: si hace falta el dato de verdad,
 * lo correcto es que el backend lo mande como campo.
 */

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const RE_COTIZO = new RegExp(`^Cotizó (.+) en (\\S+): ${NUM} MXN \\(tope de la partida ${NUM} MXN\\)$`);
const RE_RESTO_REPLANEO = new RegExp(`^(.+) en (\\S+) por ${NUM} MXN$`);

export interface OpcionCotizada {
  descripcion: string;
  comercio: string;
  montoMXN: number;
}

export interface LoQueCambio {
  /** Lo que quedó como opción final de la partida (lo comprado, o lo cotizado si no hubo cobro). */
  compra: string | null;
  /** La primera opción, que se descartó por una más barata. */
  antes: OpcionCotizada | null;
}

export interface LecturaTimeline {
  /** Índice de la partida en `evento.partidas` → lo que se pudo leer. Sin entrada = no se sabe. */
  porPartida: Map<number, LoQueCambio>;
  /** Suma de las primeras cotizaciones, solo si se leyó exactamente una por partida. */
  primeraCotizacionMXN: number | null;
}

interface Cotizacion extends OpcionCotizada {
  topeMXN: number;
}

function leerCotizo(mensaje: string): Cotizacion | null {
  const m = RE_COTIZO.exec(mensaje);
  if (!m) return null;
  const montoMXN = Number(m[3]);
  const topeMXN = Number(m[4]);
  if (!Number.isFinite(montoMXN) || !Number.isFinite(topeMXN)) return null;
  return { descripcion: m[1], comercio: m[2], montoMXN, topeMXN };
}

export function leerTimeline(timeline: EntradaTimeline[], partidas: Partida[]): LecturaTimeline {
  const porPartida = new Map<number, LoQueCambio>();
  const cotizaciones: Cotizacion[] = [];

  try {
    let ultima: Cotizacion | null = null;

    for (const paso of timeline) {
      if (paso.actor !== 'agente') continue;

      const cot = leerCotizo(paso.mensaje);
      if (cot) {
        cotizaciones.push(cot);
        ultima = cot;
        continue;
      }

      if (!paso.mensaje.startsWith('Replaneó ')) continue;
      const previa: Cotizacion | null = ultima;
      ultima = null;

      // La partida se reconoce por su nombre real, no por regex: un nombre puede traer «:».
      const candidatas = partidas
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => paso.mensaje.startsWith(`Replaneó ${p.nombre}: `));
      for (const { p, i } of candidatas) {
        const resto = RE_RESTO_REPLANEO.exec(paso.mensaje.slice(`Replaneó ${p.nombre}: `.length));
        if (!resto) continue;
        const monto = Number(resto[3]);
        // Solo vale si coincide con lo que el contrato dice de la partida.
        if (resto[2] !== p.comercio || monto !== p.cotizadoMXN || porPartida.has(i)) continue;
        const antes =
          previa && previa.topeMXN === p.presupuestadoMXN && previa.montoMXN > monto
            ? { descripcion: previa.descripcion, comercio: previa.comercio, montoMXN: previa.montoMXN }
            : null;
        porPartida.set(i, { compra: resto[1], antes });
        break;
      }
    }

    // Partidas sin replaneo: la cotización que coincide en comercio, monto y tope es la suya.
    partidas.forEach((p, i) => {
      if (porPartida.has(i) || p.cotizadoMXN === null) return;
      const suyas = cotizaciones.filter(
        (c) => c.comercio === p.comercio && c.montoMXN === p.cotizadoMXN && c.topeMXN === p.presupuestadoMXN,
      );
      if (suyas.length === 1) porPartida.set(i, { compra: suyas[0].descripcion, antes: null });
    });
  } catch {
    // Cualquier sorpresa en los mensajes: se informa «no se sabe» y la pantalla sigue.
    return { porPartida: new Map(), primeraCotizacionMXN: null };
  }

  const primeraCotizacionMXN =
    partidas.length > 0 && cotizaciones.length === partidas.length
      ? Math.round(cotizaciones.reduce((s, c) => s + c.montoMXN, 0) * 100) / 100
      : null;

  return { porPartida, primeraCotizacionMXN };
}
