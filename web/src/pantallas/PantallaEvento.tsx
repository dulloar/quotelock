import { useEffect, useMemo, useRef, useState } from 'react';
import { ejecutarEvento, mensajeDeError, obtenerEvento } from '../datos/fuente';
import type { Lectura } from '../datos/fuente';
import { BarraTecho } from '../evento/BarraTecho';
import {
  cifrasDeApoyo,
  cuentas,
  encabezado,
  grupos,
  nadieIntervino,
  pasosClave,
  salidas,
  sello,
  veredicto,
} from '../evento/derivar';
import type { Cuentas, Grupo } from '../evento/derivar';
import { Icono } from '../evento/Icono';
import type { TipoIcono } from '../evento/Icono';
import { leerTimeline } from '../evento/leerTimeline';
import type { LecturaTimeline, LoQueCambio } from '../evento/leerTimeline';
import { ETIQUETA_ESTADO_EVENTO, fechaLarga, horaCorta, horaMinuto, mensajeLegible, mxn, porcentaje } from '../formato';
import type { Actor, Evento, Partida } from '../tipos';
import { AvisoSinConexion } from './AvisoSinConexion';
import './evento.css';

// Pantalla del evento, dirección F «El agente te cuenta»: un informe en primera persona.
// Orden de lectura: frase de estado → cobrado contra el techo → partidas por lo que les pasó
// → cómo lo hice → datos del evento. Las cuentas viven en ../evento/derivar.ts.
//
// Pago con aprobación en Reap: mientras el evento está `por_aprobar` la pantalla vuelve a leerlo
// cada 3 segundos (el backend refresca contra Reap en cada GET) y cada partida pendiente trae
// su enlace «Aprobar en Reap».

/** Cada cuánto se vuelve a leer un evento que espera aprobación. Lo fija el contrato (docs/05). */
const SONDEO_MS = 3_000;

const ETIQUETA_ACTOR: Record<Actor, string> = { agente: 'Agente', reglas: 'Reglas', humano: 'Persona' };

const ICONO_GRUPO: Record<Grupo['estado'], TipoIcono> = {
  por_aprobar: 'espera',
  aprobado: 'cabe',
  otro: 'pendiente',
  pagado: 'cabe',
  ajustado: 'cambio',
  bloqueado: 'alto',
  no_lograda: 'noLograda',
  pendiente: 'pendiente',
};

const cuantasPartidas = (n: number) => (n === 1 ? 'Una sola partida' : `${n} partidas`);

/** Resalta los montos ($1,218.90) dentro de una frase, sin tocar el texto. */
function ConCifras({ texto }: { texto: string }) {
  const partes = texto.split(/(\$[\d,]+(?:\.\d{2})?)/);
  return <>{partes.map((parte, i) => (i % 2 === 1 ? <strong key={i}>{parte}</strong> : parte))}</>;
}

/** Con qué se paga, dicho sin adornos. `modoPago` puede faltar en datos viejos: entonces no se afirma nada. */
function modoDePago(evento: Evento): { etiqueta: string; dato: string; real: boolean } | null {
  if (evento.modoSimulado) return { etiqueta: 'MODO SIMULADO', dato: 'MODO SIMULADO', real: false };
  if (evento.modoPago === 'aprobacion') {
    return { etiqueta: 'SANDBOX DE REAP · con tu aprobación', dato: 'Sandbox de Reap · tú apruebas cada cargo', real: true };
  }
  return null;
}

/** Solo se enlaza a una dirección web: el campo viene de fuera y un enlace abre lo que le pongan. */
function urlSegura(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Cómo va el sondeo de un evento que espera aprobación. */
interface Sondeo {
  /** Momento de la última lectura que sí respondió el backend. */
  ultima: number;
  /** Momento del último intento fallido, si el más reciente falló. */
  fallo: number | null;
  /** Reloj de la pantalla: avanza con cada intento, para decir si una aprobación ya venció. */
  ahora: number;
}

const horaDe = (ms: number) => horaCorta(new Date(ms).toISOString());

function AvisoSondeo({ sondeo }: { sondeo: Sondeo }) {
  return (
    <p className={`ev-sondeo ${sondeo.fallo ? 'ev-sondeo--fallo' : ''}`}>
      <i aria-hidden="true" />
      {sondeo.fallo ? (
        <span>
          <strong>No pude revisar a las {horaDe(sondeo.fallo)}.</strong> Lo intento de nuevo en 3 segundos. Lo que ves es de
          las {horaDe(sondeo.ultima)}.
        </span>
      ) : (
        <span>
          Reviso Reap cada 3 segundos; no hace falta recargar. Última revisión: <b>{horaDe(sondeo.ultima)}</b>
        </span>
      )}
    </p>
  );
}

function Ejecutar({
  evento,
  sinConexion,
  alResolver,
}: {
  evento: Evento;
  sinConexion: boolean;
  alResolver: (resuelto: Evento) => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Candado contra el doble envío: el estado `enviando` tarda un render en deshabilitar el botón.
  const enCurso = useRef(false);
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  async function ejecutar() {
    if (enCurso.current) return;
    enCurso.current = true;
    setEnviando(true);
    setError(null);
    try {
      const resuelto = await ejecutarEvento(evento.id);
      alResolver(resuelto);
    } catch (e) {
      if (montado.current) setError(mensajeDeError(e));
    } finally {
      enCurso.current = false;
      if (montado.current) setEnviando(false);
    }
  }

  const conAprobacion = evento.modoPago === 'aprobacion' && !evento.modoSimulado;
  return (
    <div className="ev-accion">
      <button type="button" className="ev-boton ev-boton--grande" onClick={ejecutar} disabled={enviando || sinConexion} aria-busy={enviando || undefined}>
        {enviando ? 'Ejecutando…' : 'Ejecutar'}
      </button>
      <p className="ev-accion__nota" role="status">
        {sinConexion
          ? 'Sin conexión al backend no puedo ejecutar este evento.'
          : enviando
            ? 'Estoy cotizando y validando contra tu techo. No cierres esta pantalla.'
            : conAprobacion
              ? 'Al ejecutar cotizo, valido cada compra contra tu techo y preparo los cargos. No cobro ninguno: tú apruebas cada uno en Reap.'
              : 'Al ejecutar cotizo, valido cada compra contra tu techo y pago solo lo que cabe.'}
      </p>
      {error && (
        <p className="ev-aviso ev-aviso--error" role="alert">
          <Icono tipo="alto" />
          <span>No pude ejecutarlo: {error}</span>
        </p>
      )}
    </div>
  );
}

function Encabezado({ evento, c, sondeo }: { evento: Evento; c: Cuentas; sondeo: Sondeo | null }) {
  const { titular, entrada } = encabezado(evento, c);
  const alto = c.vista === 'alto';
  const modo = modoDePago(evento);
  return (
    <section className={`ev-estado ${alto ? 'ev-estado--alto' : ''}`} aria-labelledby="ev-titular">
      <p className="ev-ceja">
        <span>
          Informe de tu agente · <strong>{evento.nombre}</strong> · {fechaLarga(evento.fecha)}
        </span>
        {modo && <span className={`ev-simulado ${modo.real ? 'ev-simulado--real' : ''}`}>{modo.etiqueta}</span>}
      </p>
      {/* Región viva: el titular solo cambia cuando cambia el estado (se aprobó un cargo, terminó, se detuvo). */}
      <div className="ev-titular" aria-live="polite" aria-atomic="true">
        <Icono
          tipo={alto ? 'altoInvertido' : c.vista === 'borrador' ? 'pendiente' : c.vista === 'aprobacion' ? 'espera' : 'cabe'}
          grande
        />
        <h1 id="ev-titular">{titular}</h1>
      </div>
      <p className="ev-entrada">
        <ConCifras texto={entrada} />
      </p>
      {c.vista === 'aprobacion' && sondeo && <AvisoSondeo sondeo={sondeo} />}
      {alto && (
        <p className="ev-sin-cobro">
          {c.cobrado === 0 && c.cargos === 0
            ? 'No cobré nada: $0 y 0 cargos.'
            : `Cobrado hasta ahora: ${mxn(c.cobrado)} en ${c.cargos} ${c.cargos === 1 ? 'cargo' : 'cargos'}.`}
        </p>
      )}
    </section>
  );
}

function Medida({ evento, c }: { evento: Evento; c: Cuentas }) {
  const apoyo = cifrasDeApoyo(evento, c);

  let nota: { icono: TipoIcono; texto: string };
  if (c.vista === 'borrador') {
    nota = { icono: 'pendiente', texto: 'Aún no cotizo ni pago nada. La barra está vacía.' };
  } else if (c.vista === 'aprobacion') {
    nota =
      c.margenComprometido > 0
        ? {
            icono: 'margen',
            texto: `Con todo aprobado el total sería ${mxn(c.comprometido)}: usaría ${mxn(c.margenComprometido)} de los ${mxn(c.margenTotal)} del margen (${porcentaje(c.margenComprometido / c.margenTotal)}).`,
          }
        : {
            icono: 'espera',
            texto: `Con todo aprobado el total sería ${mxn(c.comprometido)}: cabe en tu presupuesto, sin tocar el margen de ${mxn(c.margenTotal)}.`,
          };
  } else if (c.vista === 'alto') {
    nota =
      c.rebasaTecho > 0
        ? { icono: 'alto', texto: `Lo cotizado rebasa el techo por ${mxn(c.rebasaTecho)}. Por eso no pagué.` }
        : c.cobrado > 0
          ? { icono: 'alto', texto: `Se cobró ${mxn(c.cobrado)} antes de detenerme. No cobro nada más.` }
          : { icono: 'alto', texto: 'Me detuve antes de pagar.' };
  } else if (c.margenUsado > 0) {
    nota = {
      icono: 'margen',
      texto: `Usé ${mxn(c.margenUsado)} de los ${mxn(c.margenTotal)} del margen (${porcentaje(c.margenUsado / c.margenTotal)}).`,
    };
  } else {
    nota = { icono: 'cabe', texto: `Cupo en tu presupuesto: no toqué el margen de ${mxn(c.margenTotal)}.` };
  }

  return (
    <section className="ev-medida" aria-label="Cobrado contra tu techo">
      <p className="ev-medida__cifra">
        <b>{mxn(c.cobrado)}</b>{' '}
        <span>
          cobrado ·{' '}
          {c.vista === 'aprobacion' && (
            <>
              <strong>{mxn(c.porAprobarMXN)}</strong> por aprobar ·{' '}
            </>
          )}
          tu techo es <strong>{mxn(c.techo)}</strong>
        </span>
      </p>
      <BarraTecho cuentas={c} />
      <p className="ev-medida__nota">
        <Icono tipo={nota.icono} />
        <span>
          <ConCifras texto={nota.texto} />
        </span>
      </p>
      <dl className="ev-apoyo">
        {apoyo.map((a) => (
          <div key={a.etiqueta}>
            <dt>
              {a.reglas && <Icono tipo="reglas" />}
              {a.etiqueta}
            </dt>
            <dd>
              <b>{a.valor}</b>
              <span>{a.nota}</span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Pido({ evento, c }: { evento: Evento; c: Cuentas }) {
  const lista = salidas(evento, c);
  return (
    <section className="ev-pido" aria-labelledby="ev-h-pido">
      <h2 id="ev-h-pido">Esto necesito de ti</h2>
      <p>
        Que decidas cómo seguimos.{' '}
        {c.cobrado === 0 ? 'Mientras tanto, tu dinero está intacto.' : 'Mientras tanto, no cobro nada más.'}
        {lista.length > 0 && ' Las salidas posibles:'}
      </p>
      {lista.length > 0 && (
        <ul>
          {lista.map((s) => (
            <li key={s.titulo}>
              <span className="ev-pido__titulo">
                {s.titulo} <small>Próximamente</small>
              </span>
              <span className="ev-pido__nota">{s.nota}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** La acción principal mientras el evento espera: un enlace real a la página de Reap, con su vencimiento. */
function Aprobar({ p, ahora }: { p: Partida; ahora: number }) {
  const url = urlSegura(p.urlAprobacion);
  const expira = p.aprobacionExpira ? Date.parse(p.aprobacionExpira) : NaN;
  const seSabe = Number.isFinite(expira);
  const vencida = seSabe && expira <= ahora;
  const minutos = Math.max(1, Math.ceil((expira - ahora) / 60_000));

  return (
    <div className="ev-aprobar">
      {url ? (
        <a className={`ev-boton ${vencida ? 'ev-boton--secundario' : ''}`} href={url} target="_blank" rel="noopener noreferrer">
          Aprobar en Reap
          <span className="ev-solo-lector">
            {' '}
            el cargo de {p.nombre}
            {p.cotizadoMXN !== null && ` por ${mxn(p.cotizadoMXN)}`} (abre otra pestaña)
          </span>
          <Icono tipo="fuera" />
        </a>
      ) : (
        <p className="ev-aprobar__falta">
          <strong>No recibí el enlace para aprobar este cargo.</strong> Sin él no se puede aprobar desde aquí.
        </p>
      )}
      <p className="ev-aprobar__vence">
        {vencida ? (
          <>
            <strong>La aprobación venció a las {horaMinuto(p.aprobacionExpira!)}.</strong> Si Reap ya no la acepta, este
            cargo no se cobra y te aviso aquí.
          </>
        ) : seSabe ? (
          <>
            {url && 'Se abre en otra pestaña. '}Tienes hasta las <strong>{horaMinuto(p.aprobacionExpira!)}</strong> para
            aprobarlo ({minutos === 1 ? 'queda 1 minuto o menos' : `quedan ${minutos} min`}).
          </>
        ) : (
          <>{url && 'Se abre en otra pestaña. '}No sé cuándo vence esta aprobación.</>
        )}
      </p>
    </div>
  );
}

function FilaPartida({ p, c, cambio, ahora }: { p: Partida; c: Cuentas; cambio: LoQueCambio | undefined; ahora: number }) {
  const v = veredicto(p, c);
  const s = sello(p);
  const cobrada = p.cobradoMXN !== null;
  const porAprobar = p.estado === 'por_aprobar';
  const monto = p.cobradoMXN ?? p.cotizadoMXN;

  return (
    <li className="ev-partida">
      <div className="ev-partida__cab">
        <div>
          <p className="ev-partida__nombre">{p.nombre}</p>
          <p className="ev-partida__comercio">{p.comercio}</p>
        </div>
        <p className={`ev-partida__monto ${cobrada ? '' : 'ev-partida__monto--sin'}`}>
          <small>
            {cobrada
              ? p.checkoutId
                ? 'se cobró'
                : 'cobré'
              : porAprobar
                ? 'preparé · sin cobrar'
                : monto !== null
                  ? 'cotizó · no cobré'
                  : 'su tope'}
          </small>
          <b>{mxn(monto ?? p.presupuestadoMXN)}</b>
        </p>
      </div>
      <p className={`ev-veredicto ev-veredicto--${v.tono}`}>
        {s && <span className={`ev-sello ev-sello--${s.tono}`}>{s.palabra}</span>}
        <strong>{v.palabra}:</strong> {v.cuenta}
      </p>
      {porAprobar && <Aprobar p={p} ahora={ahora} />}
      {cambio?.antes ? (
        <p className="ev-cambio">
          Primero coticé {cambio.antes.descripcion} en {cambio.antes.comercio}: {mxn(cambio.antes.montoMXN)}.{' '}
          {cobrada || porAprobar ? 'Lo cambié por' : 'Probé con'} {cambio.compra}.
        </p>
      ) : (
        cambio?.compra && (
          <p className="ev-cambio">
            {cobrada ? 'Compré' : porAprobar ? 'Voy a comprar' : 'Coticé'}: {cambio.compra}.
          </p>
        )
      )}
      <details className="ev-plegado">
        <summary>Ver detalle</summary>
        <dl className="ev-detalle">
          <dt>Tope de la partida</dt>
          <dd>{mxn(p.presupuestadoMXN)}</dd>
          <dt>Cotizado</dt>
          <dd>{p.cotizadoMXN === null ? 'Sin cotización' : mxn(p.cotizadoMXN)}</dd>
          <dt>Cobrado</dt>
          <dd>{p.cobradoMXN === null ? 'Nada' : mxn(p.cobradoMXN)}</dd>
          <dt>Orden</dt>
          <dd>{p.orderId ?? (cobrada ? 'Todavía sin número de orden' : porAprobar ? 'Sin orden: falta aprobar' : 'Sin orden: no se pagó')}</dd>
          {p.checkoutId && (
            <>
              <dt>Cargo en Reap</dt>
              <dd>{p.checkoutId}</dd>
            </>
          )}
          {p.tipoCambio != null && p.tipoCambio !== 1 && (
            <>
              <dt>Tipo de cambio</dt>
              <dd>{p.tipoCambio}</dd>
            </>
          )}
        </dl>
      </details>
    </li>
  );
}

function Partidas({ evento, c, lectura, ahora }: { evento: Evento; c: Cuentas; lectura: LecturaTimeline; ahora: number }) {
  const lista: Grupo[] = grupos(evento);
  const n = evento.partidas.length;
  const titulo =
    c.vista === 'alto'
      ? 'Esto intenté pagar'
      : c.vista === 'borrador'
        ? 'Las partidas'
        : c.vista === 'aprobacion'
          ? 'Esto preparé'
          : 'Esto pagué';
  const bajada =
    n === 0
      ? 'Todavía no armo las partidas de este evento.'
      : c.vista === 'aprobacion'
        ? `${cuantasPartidas(n)}. Cada cargo se cobra solo cuando lo apruebas en Reap; aquí se actualiza solo.`
        : c.vista === 'alto' && c.cobrado === 0
        ? 'Ninguna partida se cobró. Estas son las opciones más baratas que encontré.'
        : n === 1 ? 'Una sola partida.' : `${n} partidas, agrupadas por lo que les pasó.`;

  return (
    <section className="ev-bloque" aria-labelledby="ev-h-partidas">
      <h2 id="ev-h-partidas">{titulo}</h2>
      <p>{bajada}</p>
      {lista.map((g) => (
        <div className={`ev-grupo ev-grupo--${g.estado}`} key={g.estado}>
          <h3>
            <Icono tipo={ICONO_GRUPO[g.estado]} />
            {g.titulo} <small>{g.resumen}</small>
          </h3>
          <ul>
            {g.indices.map((i) => (
              <FilaPartida key={i} p={evento.partidas[i]} c={c} cambio={lectura.porPartida.get(i)} ahora={ahora} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function AsiLoHice({ evento, c, lectura }: { evento: Evento; c: Cuentas; lectura: LecturaTimeline }) {
  const pasos = pasosClave(evento, c, lectura);
  return (
    <section className="ev-bloque ev-bloque--lado" aria-labelledby="ev-h-hice">
      <h2 id="ev-h-hice">{c.vista === 'alto' ? 'Así llegué al alto' : 'Así lo hice'}</h2>
      {pasos.length === 0 ? (
        <p>Todavía no hay pasos: el evento está creado, sin ejecutar.</p>
      ) : (
        <ol className="ev-pasos">
          {pasos.map((paso, i) => (
            <li key={i} className={paso.tipo === 'normal' ? undefined : `ev-paso--${paso.tipo}`}>
              <p>
                {paso.tipo !== 'normal' && paso.rotulo && <span>{paso.rotulo}</span>}
                {paso.texto}
              </p>
            </li>
          ))}
        </ol>
      )}
      {nadieIntervino(c) && (
        <p className="ev-cierre">
          <Icono tipo="cabe" />
          Nadie tuvo que intervenir.
        </p>
      )}
      {evento.timeline.length > 0 && (
        <details className="ev-plegado ev-bitacora">
          <summary>Ver bitácora completa ({evento.timeline.length} pasos)</summary>
          <ol>
            {evento.timeline.map((paso, i) => (
              <li key={i}>
                <span className="ev-bitacora__quien">
                  <time dateTime={paso.hora}>{horaCorta(paso.hora)}</time> ·{' '}
                  <b className={paso.actor === 'reglas' ? 'ev-c-reglas' : ''}>{ETIQUETA_ACTOR[paso.actor] ?? paso.actor}</b>
                </span>
                <span>{mensajeLegible(paso.mensaje)}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}

function DatosEvento({ evento, c }: { evento: Evento; c: Cuentas }) {
  const costo = evento.totales.costoPorAsistenteMXN;
  // El backend calcula el costo sobre lo cotizado cuando no hubo cobro; solo se dice si la cuenta lo confirma.
  const sobreCotizado =
    c.cobrado === 0 && evento.asistentes > 0 && Math.abs(costo - c.cotizado / evento.asistentes) < 0.01;
  const textoCosto =
    c.vista === 'borrador'
      ? 'Sin ejecutar'
      : c.cobrado > 0
        ? mxn(costo)
        : sobreCotizado
          ? `${mxn(costo)} · sobre lo cotizado, sin cobro`
          : `${mxn(costo)} · nada cobrado`;

  return (
    <section className="ev-contexto" aria-labelledby="ev-h-datos">
      <h2 id="ev-h-datos">Datos del evento</h2>
      <dl>
        <dt>Evento</dt>
        <dd>{evento.nombre}</dd>
        <dt>Fecha</dt>
        <dd>{fechaLarga(evento.fecha)}</dd>
        <dt>Asistentes</dt>
        <dd>{evento.asistentes}</dd>
        <dt>Costo por asistente</dt>
        <dd>{textoCosto}</dd>
        <dt>Presupuesto</dt>
        <dd>{mxn(c.presupuesto)}</dd>
        <dt>Margen permitido</dt>
        <dd>
          {porcentaje(evento.margen)} · {mxn(c.margenTotal)}
        </dd>
        <dt>Techo</dt>
        <dd>{mxn(c.techo)}</dd>
        <dt>Estado</dt>
        <dd>{ETIQUETA_ESTADO_EVENTO[evento.estado] ?? evento.estado}</dd>
        <dt>Pagos</dt>
        <dd>{modoDePago(evento)?.dato ?? 'Reales'}</dd>
        {evento.notas && (
          <>
            <dt>Notas del brief</dt>
            <dd className="ev-contexto__notas">{evento.notas}</dd>
          </>
        )}
      </dl>
      {evento.notas && <p className="ev-contexto__pie">Las notas se guardan tal cual: no cambian las reglas ni los montos.</p>}
    </section>
  );
}

function Informe({
  evento,
  sinConexion,
  sondeo,
  alEjecutar,
}: {
  evento: Evento;
  sinConexion: boolean;
  sondeo: Sondeo;
  alEjecutar: (resuelto: Evento) => void;
}) {
  const c = useMemo(() => cuentas(evento), [evento]);
  const lectura = useMemo(() => leerTimeline(evento.timeline, evento.partidas), [evento]);

  return (
    <div className="ev-columnas">
      <div className="ev-principal">
        <Encabezado evento={evento} c={c} sondeo={sinConexion ? null : sondeo} />
        {c.vista === 'borrador' && <Ejecutar key={evento.id} evento={evento} sinConexion={sinConexion} alResolver={alEjecutar} />}
        <Medida evento={evento} c={c} />
        {c.vista === 'alto' && <Pido evento={evento} c={c} />}
        <Partidas evento={evento} c={c} lectura={lectura} ahora={sondeo.ahora} />
      </div>
      <aside className="ev-lado">
        <AsiLoHice evento={evento} c={c} lectura={lectura} />
        <DatosEvento evento={evento} c={c} />
      </aside>
    </div>
  );
}

function Regreso() {
  return (
    <a href="#/" className="ev-regreso">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M14.5 5.5L8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Eventos
    </a>
  );
}

export function PantallaEvento({ id }: { id: string }) {
  const [lectura, setLectura] = useState<Lectura<Evento | null> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sondeo, setSondeo] = useState<Sondeo>(() => ({ ultima: Date.now(), fallo: null, ahora: Date.now() }));
  const idVigente = useRef(id);
  idVigente.current = id;

  useEffect(() => {
    let vigente = true;
    setLectura(null);
    setError(null);
    obtenerEvento(id)
      .then((l) => {
        if (!vigente) return;
        setLectura(l);
        setSondeo({ ultima: Date.now(), fallo: null, ahora: Date.now() });
      })
      .catch((e) => vigente && setError(mensajeDeError(e)));
    return () => {
      vigente = false;
    };
  }, [id]);

  // Sondeo: solo mientras el evento leído del backend está `por_aprobar`. Cada consulta se programa
  // al terminar la anterior (nunca hay dos encimadas) y el efecto se limpia al cambiar de estado,
  // de evento o al salir de la pantalla. Un fallo no borra lo que ya se ve: se avisa y se reintenta.
  const esperaAprobacion = lectura?.origen === 'api' && lectura.datos?.estado === 'por_aprobar';
  useEffect(() => {
    if (!esperaAprobacion) return;
    let vigente = true;
    let reloj: number | undefined;

    const revisar = async () => {
      const inicio = Date.now();
      let nueva: Lectura<Evento | null> | null = null;
      try {
        nueva = await obtenerEvento(id);
      } catch {
        // Error del backend (500, etc.): se trata igual que una revisión fallida.
      }
      if (!vigente) return;
      const ahora = Date.now();
      // Sin conexión `obtenerEvento` cae a los datos de ejemplo: aquí eso cuenta como fallo, no como dato.
      const evento = nueva?.origen === 'api' ? nueva.datos : null;
      if (evento) {
        setLectura({ datos: evento, origen: 'api' });
        setSondeo({ ultima: ahora, fallo: null, ahora });
      } else {
        setSondeo((s) => ({ ...s, fallo: ahora, ahora }));
      }
      reloj = window.setTimeout(revisar, Math.max(0, SONDEO_MS - (ahora - inicio)));
    };

    reloj = window.setTimeout(revisar, SONDEO_MS);
    return () => {
      vigente = false;
      window.clearTimeout(reloj);
    };
  }, [id, esperaAprobacion]);

  const alEjecutar = (resuelto: Evento) => {
    // Si mientras ejecutaba se abrió otro evento, la respuesta ya no es de esta pantalla.
    if (resuelto.id !== idVigente.current) return;
    setLectura({ datos: resuelto, origen: 'api' });
    setSondeo({ ultima: Date.now(), fallo: null, ahora: Date.now() });
  };

  if (error) {
    return (
      <div className="ev-raiz">
        <Regreso />
        <p className="ev-aviso ev-aviso--error" role="alert">
          <Icono tipo="alto" />
          <span>
            No pude leer el evento {id}: {error}
          </span>
        </p>
      </div>
    );
  }
  if (!lectura) {
    return (
      <div className="ev-raiz">
        <p className="ev-aviso" role="status">
          Cargando evento…
        </p>
      </div>
    );
  }

  const sinConexion = lectura.origen === 'ejemplo';
  const evento = lectura.datos;
  if (evento === null) {
    return (
      <div className="ev-raiz">
        <Regreso />
        {sinConexion && <AvisoSinConexion />}
        <p className="ev-aviso">
          <Icono tipo="noLograda" />
          <span>
            {sinConexion ? `El evento ${id} no está entre los datos de ejemplo.` : `No existe el evento ${id}.`}
          </span>
        </p>
      </div>
    );
  }

  return (
    <article className="ev-raiz">
      <Regreso />
      {sinConexion && <AvisoSinConexion />}
      <Informe evento={evento} sinConexion={sinConexion} sondeo={sondeo} alEjecutar={alEjecutar} />
    </article>
  );
}
