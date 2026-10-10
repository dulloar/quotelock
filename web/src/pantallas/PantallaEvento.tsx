import { useEffect, useMemo, useState } from 'react';
import { mensajeDeError, obtenerEvento, reintentarEvento } from '../datos/fuente';
import type { Lectura } from '../datos/fuente';
import { BarraTecho } from '../evento/BarraTecho';
import {
  cifrasDeApoyo,
  cuantas,
  cuentas,
  encabezado,
  grupos,
  nadieIntervino,
  pasosClave,
  salidas,
  veredicto,
} from '../evento/derivar';
import type { Cuentas, Grupo } from '../evento/derivar';
import { Icono } from '../evento/Icono';
import type { TipoIcono } from '../evento/Icono';
import { leerTimeline } from '../evento/leerTimeline';
import type { LecturaTimeline, LoQueCambio } from '../evento/leerTimeline';
import { ETIQUETA_ESTADO_EVENTO, fechaLarga, horaCorta, horaLimite, mensajeLegible, mxn, porcentaje } from '../formato';
import type { Actor, EstadoPartida, Evento, Partida } from '../tipos';
import { AvisoSinConexion } from './AvisoSinConexion';
import './evento.css';

// Pantalla del evento, dirección F «El agente te cuenta»: un informe en primera persona.
// Orden de lectura: frase de estado → cobrado contra el techo → partidas por lo que les pasó
// → cómo lo hice → datos del evento. Las cuentas viven en ../evento/derivar.ts.

const ETIQUETA_ACTOR: Record<Actor, string> = { agente: 'Agente', reglas: 'Reglas', humano: 'Persona' };

const ICONO_GRUPO: Record<EstadoPartida, TipoIcono> = {
  pagado: 'cabe',
  ajustado: 'cambio',
  bloqueado: 'alto',
  no_lograda: 'noLograda',
  pendiente: 'pendiente',
  por_aprobar: 'margen',
  aprobado: 'cabe',
};

/** Resalta los montos ($1,218.90) dentro de una frase, sin tocar el texto. */
function ConCifras({ texto }: { texto: string }) {
  const partes = texto.split(/(\$[\d,]+(?:\.\d{2})?)/);
  return <>{partes.map((parte, i) => (i % 2 === 1 ? <strong key={i}>{parte}</strong> : parte))}</>;
}

function Encabezado({ evento, c }: { evento: Evento; c: Cuentas }) {
  const { titular, entrada } = encabezado(evento, c);
  const alto = c.vista === 'alto';
  return (
    <section className={`ev-estado ${alto ? 'ev-estado--alto' : ''}`} aria-labelledby="ev-titular">
      <p className="ev-ceja">
        <span>
          Informe de tu agente · <strong>{evento.nombre}</strong> · {fechaLarga(evento.fecha)}
        </span>
        {evento.modoSimulado && <span className="ev-simulado">MODO SIMULADO</span>}
      </p>
      <div className="ev-titular">
        <Icono tipo={alto ? 'altoInvertido' : c.vista === 'borrador' ? 'pendiente' : 'cabe'} grande />
        <h1 id="ev-titular">{titular}</h1>
      </div>
      <p className="ev-entrada">
        <ConCifras texto={entrada} />
      </p>
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
  } else if (c.vista === 'alto') {
    nota =
      c.rebasaTecho > 0
        ? { icono: 'alto', texto: `Lo cotizado rebasa el techo por ${mxn(c.rebasaTecho)}. Por eso no pagué.` }
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
          cobrado · tu techo es <strong>{mxn(c.techo)}</strong>
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

function FilaPartida({ p, c, cambio }: { p: Partida; c: Cuentas; cambio: LoQueCambio | undefined }) {
  const v = veredicto(p, c);
  const cobrada = p.cobradoMXN !== null;
  const monto = p.cobradoMXN ?? p.cotizadoMXN;

  return (
    <li className="ev-partida">
      <div className="ev-partida__cab">
        <div>
          <p className="ev-partida__nombre">{p.nombre}</p>
          <p className="ev-partida__comercio">{p.comercio}</p>
        </div>
        <p className={`ev-partida__monto ${cobrada ? '' : 'ev-partida__monto--sin'}`}>
          <small>{cobrada ? 'cobré' : monto !== null ? 'cotizó · no cobré' : 'su tope'}</small>
          <b>{mxn(monto ?? p.presupuestadoMXN)}</b>
        </p>
      </div>
      <p className={`ev-veredicto ev-veredicto--${v.tono}`}>
        <strong>{v.palabra}:</strong> {v.cuenta}
      </p>
      {cambio?.antes ? (
        <p className="ev-cambio">
          Primero coticé {cambio.antes.descripcion} en {cambio.antes.comercio}: {mxn(cambio.antes.montoMXN)}.{' '}
          {cobrada ? 'Lo cambié por' : 'Probé con'} {cambio.compra}.
        </p>
      ) : (
        cambio?.compra && (
          <p className="ev-cambio">
            {cobrada ? 'Compré' : 'Coticé'}: {cambio.compra}.
          </p>
        )
      )}
      {p.estado === 'por_aprobar' && p.urlAprobacion && (
        <p className="ev-aprobar">
          <a className="boton boton--principal" href={p.urlAprobacion} target="_blank" rel="noopener noreferrer">
            Aprobar en Reap
          </a>
          {p.aprobacionExpira && <span>Vence a las {horaLimite(p.aprobacionExpira)}</span>}
        </p>
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
          <dd>{p.orderId ?? 'Sin orden: no se pagó'}</dd>
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

function Partidas({ evento, c, lectura }: { evento: Evento; c: Cuentas; lectura: LecturaTimeline }) {
  const lista: Grupo[] = grupos(evento);
  const n = evento.partidas.length;
  const titulo = c.vista === 'alto' ? 'Esto intenté pagar' : c.vista === 'borrador' ? 'Las partidas' : c.porAprobarEvento ? 'Esto voy a pagar' : 'Esto pagué';
  const bajada =
    n === 0
      ? 'Todavía no armo las partidas de este evento.'
      : c.vista === 'alto' && c.cobrado === 0
        ? 'Ninguna partida se cobró. Estas son las opciones más baratas que encontré.'
        : n === 1 ? 'Una sola partida.' : `${n} partidas, agrupadas por lo que les pasó.`;

  return (
    <section className="ev-bloque" aria-labelledby="ev-h-partidas">
      <h2 id="ev-h-partidas">{titulo}</h2>
      <p>{bajada}</p>
      {lista.map((g) => (
        <div className="ev-grupo" key={g.estado}>
          <h3>
            <Icono tipo={ICONO_GRUPO[g.estado]} />
            {g.titulo} <small>{g.resumen}</small>
          </h3>
          <ul>
            {g.indices.map((i) => (
              <FilaPartida key={i} p={evento.partidas[i]} c={c} cambio={lectura.porPartida.get(i)} />
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
            <li key={i} className={paso.tipo === 'normal' ? '' : `ev-paso--${paso.tipo}`}>
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
                  <b className={paso.actor === 'reglas' ? 'ev-c-reglas' : ''}>{ETIQUETA_ACTOR[paso.actor]}</b>
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
        <dd>{ETIQUETA_ESTADO_EVENTO[evento.estado]}</dd>
        <dt>Pagos</dt>
        <dd>{evento.modoSimulado ? 'MODO SIMULADO' : 'Reales'}</dd>
      </dl>
    </section>
  );
}

function AvisoAprobacion({
  evento,
  c,
  onReintentar,
  reintentando,
  errorReintento,
}: {
  evento: Evento;
  c: Cuentas;
  onReintentar: () => void;
  reintentando: boolean;
  errorReintento: string | null;
}) {
  const puedeReintentar =
    evento.estado === 'revision_humana' &&
    evento.modoPago === 'aprobacion' &&
    evento.partidas.some((p) => p.estado === 'no_lograda' || p.estado === 'bloqueado');
  if (!c.porAprobarEvento && !puedeReintentar && !errorReintento) return null;
  return (
    <div className="ev-aprobacion">
      {c.porAprobarEvento && (
        <p className="ev-aviso" role="status">
          <Icono tipo="margen" />
          <span>
            {cuantas(c.porAprobar, 'cargo espera', 'cargos esperan')} tu aprobación en Reap. Apruébalos pronto: las
            cotizaciones vencen en unos 5 minutos.
          </span>
        </p>
      )}
      {puedeReintentar && (
        <button type="button" className="boton boton--principal" onClick={onReintentar} disabled={reintentando} aria-busy={reintentando}>
          {reintentando ? 'Recotizando…' : 'Recotizar y reintentar'}
        </button>
      )}
      {errorReintento && (
        <p className="ev-aviso ev-aviso--error" role="alert">
          <Icono tipo="alto" />
          <span>{errorReintento}</span>
        </p>
      )}
    </div>
  );
}

function Informe({
  evento,
  onReintentar,
  reintentando,
  errorReintento,
}: {
  evento: Evento;
  onReintentar: () => void;
  reintentando: boolean;
  errorReintento: string | null;
}) {
  const c = useMemo(() => cuentas(evento), [evento]);
  const lectura = useMemo(() => leerTimeline(evento.timeline, evento.partidas), [evento]);

  return (
    <div className="ev-columnas">
      <div className="ev-principal">
        <AvisoAprobacion evento={evento} c={c} onReintentar={onReintentar} reintentando={reintentando} errorReintento={errorReintento} />
        <Encabezado evento={evento} c={c} />
        <Medida evento={evento} c={c} />
        {c.vista === 'alto' && <Pido evento={evento} c={c} />}
        <Partidas evento={evento} c={c} lectura={lectura} />
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

  useEffect(() => {
    let vigente = true;
    setLectura(null);
    setError(null);
    obtenerEvento(id)
      .then((l) => vigente && setLectura(l))
      .catch((e) => vigente && setError(mensajeDeError(e)));
    return () => {
      vigente = false;
    };
  }, [id]);

  const [reintentando, setReintentando] = useState(false);
  const [errorReintento, setErrorReintento] = useState<string | null>(null);

  // Sondeo: mientras el evento espera aprobación se vuelve a pedir cada 3 s, sin pasar por «Cargando».
  const porAprobar = lectura?.origen === 'api' && lectura.datos?.estado === 'por_aprobar';
  useEffect(() => {
    if (!porAprobar) return;
    let vigente = true;
    const t = setInterval(() => {
      obtenerEvento(id)
        .then((l) => vigente && l.origen === 'api' && l.datos && setLectura(l))
        .catch(() => {
          // Un fallo suelto del sondeo no tira la pantalla: el siguiente intento lo corrige.
        });
    }, 3000);
    return () => {
      vigente = false;
      clearInterval(t);
    };
  }, [id, porAprobar]);

  function reintentar() {
    setReintentando(true);
    setErrorReintento(null);
    reintentarEvento(id)
      .then((e) => setLectura({ datos: e, origen: 'api' }))
      .catch((e) => setErrorReintento(mensajeDeError(e)))
      .finally(() => setReintentando(false));
  }

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
      <Informe evento={evento} onReintentar={reintentar} reintentando={reintentando} errorReintento={errorReintento} />
    </article>
  );
}
