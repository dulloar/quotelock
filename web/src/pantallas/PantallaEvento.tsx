import { useEffect, useState } from 'react';
import { mensajeDeError, obtenerEvento } from '../datos/fuente';
import type { Lectura } from '../datos/fuente';
import {
  ETIQUETA_ESTADO_EVENTO,
  ETIQUETA_ESTADO_PARTIDA,
  fechaLarga,
  horaCorta,
  mxn,
  porcentaje,
} from '../formato';
import type { Actor, Evento, Partida } from '../tipos';
import { AvisoSinConexion } from './AvisoSinConexion';

const ETIQUETA_ACTOR: Record<Actor, string> = {
  agente: 'Agente',
  reglas: 'Reglas',
  humano: 'Humano',
};

function conSigno(n: number): string {
  if (n === 0) return mxn(0);
  return `${n > 0 ? '+' : '−'}${mxn(Math.abs(n))}`;
}

function diferencia(p: Partida): number | null {
  const real = p.cobradoMXN ?? p.cotizadoMXN;
  return real === null ? null : real - p.presupuestadoMXN;
}

function Cifra({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div className="cifra-clave">
      <dt>{etiqueta}</dt>
      <dd className="cifra">{valor}</dd>
      {nota && <p className="cifra-clave__nota">{nota}</p>}
    </div>
  );
}

function BarraAvance({ evento }: { evento: Evento }) {
  const { presupuestoMXN: presupuesto, techoMXN: techo, totales } = evento;
  const hayCobro = totales.cobradoMXN > 0;
  // Si no se cobró nada, la barra muestra lo cotizado: es lo que el agente frenó.
  const gasto = hayCobro ? totales.cobradoMXN : totales.cotizadoMXN;
  const escala = Math.max(techo, gasto);
  const pct = (n: number) => `${(n / escala) * 100}%`;

  const enPresupuesto = Math.min(gasto, presupuesto);
  const enMargen = Math.max(0, Math.min(gasto, techo) - presupuesto);
  const sobreTecho = Math.max(0, gasto - techo);
  const margenTotal = techo - presupuesto;

  let lectura: string;
  if (sobreTecho > 0) {
    lectura = `Lo cotizado rebasa el techo por ${mxn(sobreTecho)}. ${
      hayCobro ? '' : 'No se cobró nada.'
    }`;
  } else if (enMargen > 0) {
    lectura = `Usó ${mxn(enMargen)} de los ${mxn(margenTotal)} de margen (${porcentaje(
      enMargen / margenTotal,
    )}).`;
  } else {
    lectura = `Quedó ${mxn(presupuesto - gasto)} abajo del presupuesto. No tocó el margen.`;
  }

  return (
    <section className="avance" aria-label="Avance del gasto">
      <div className="avance__encabezado">
        <h2 className="subtitulo">{hayCobro ? 'Cobrado' : 'Cotizado, sin cobrar'}</h2>
        <p className="avance__lectura">{lectura}</p>
      </div>
      <div
        className="avance__pista"
        role="img"
        aria-label={`${mxn(gasto)} de un presupuesto de ${mxn(presupuesto)} y un techo de ${mxn(techo)}`}
      >
        <div className="avance__tramo avance__tramo--presupuesto" style={{ width: pct(enPresupuesto) }} />
        <div className="avance__tramo avance__tramo--margen" style={{ width: pct(enMargen) }} />
        <div className="avance__tramo avance__tramo--exceso" style={{ width: pct(sobreTecho) }} />
        <div className="avance__marca" style={{ left: pct(presupuesto) }} />
        <div className="avance__marca avance__marca--techo" style={{ left: pct(techo) }} />
      </div>
      <div className="avance__escala">
        <span className="avance__rotulo" style={{ left: pct(presupuesto) }}>
          Presupuesto <span className="cifra">{mxn(presupuesto)}</span>
        </span>
        <span className="avance__rotulo avance__rotulo--techo" style={{ left: pct(techo) }}>
          Techo <span className="cifra">{mxn(techo)}</span>
        </span>
      </div>
    </section>
  );
}

function LibroMovimientos({ evento }: { evento: Evento }) {
  const { partidas, totales } = evento;
  const monto = (n: number | null) => (n === null ? '—' : mxn(n));
  const difTotal =
    (totales.cobradoMXN > 0 ? totales.cobradoMXN : totales.cotizadoMXN) - totales.presupuestadoMXN;

  return (
    <section>
      <h2 className="subtitulo">Libro de movimientos</h2>
      <div className="libro__marco">
        <table className="libro">
          <thead>
            <tr>
              <th scope="col">Partida</th>
              <th scope="col">Comercio</th>
              <th scope="col" className="num">Presupuestado</th>
              <th scope="col" className="num">Cotizado</th>
              <th scope="col" className="num">Cobrado</th>
              <th scope="col" className="num">Diferencia</th>
              <th scope="col">Estado</th>
              <th scope="col">Orden</th>
            </tr>
          </thead>
          <tbody>
            {partidas.map((p) => {
              const dif = diferencia(p);
              return (
                <tr key={p.nombre} data-estado={p.estado}>
                  <th scope="row">{p.nombre}</th>
                  <td className="libro__comercio">{p.comercio}</td>
                  <td className="num cifra">{mxn(p.presupuestadoMXN)}</td>
                  <td className="num cifra">{monto(p.cotizadoMXN)}</td>
                  <td className="num cifra">{monto(p.cobradoMXN)}</td>
                  <td className="num cifra" data-signo={dif === null ? undefined : Math.sign(dif)}>
                    {dif === null ? '—' : conSigno(dif)}
                  </td>
                  <td>
                    <span className="estado" data-estado={p.estado}>
                      {ETIQUETA_ESTADO_PARTIDA[p.estado]}
                    </span>
                  </td>
                  <td className="cifra libro__orden">{p.orderId ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>
                Total
              </th>
              <td className="num cifra">{mxn(totales.presupuestadoMXN)}</td>
              <td className="num cifra">{mxn(totales.cotizadoMXN)}</td>
              <td className="num cifra">{mxn(totales.cobradoMXN)}</td>
              <td className="num cifra" data-signo={Math.sign(difTotal)}>
                {conSigno(difTotal)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

function LineaTiempo({ evento }: { evento: Evento }) {
  return (
    <section>
      <h2 className="subtitulo">Línea de tiempo</h2>
      <ol className="tiempo">
        {evento.timeline.map((paso, i) => (
          <li key={i} className="tiempo__paso" data-actor={paso.actor}>
            <time className="cifra tiempo__hora" dateTime={paso.hora}>
              {horaCorta(paso.hora)}
            </time>
            <span className="tiempo__actor">{ETIQUETA_ACTOR[paso.actor]}</span>
            <span className="tiempo__mensaje">{paso.mensaje}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Contador({ evento }: { evento: Evento }) {
  const cuenta = (actor: Actor) => evento.timeline.filter((p) => p.actor === actor).length;
  const agente = cuenta('agente');
  const reglas = cuenta('reglas');
  const humano = cuenta('humano');

  return (
    <section>
      <h2 className="subtitulo">Quién hizo qué</h2>
      <dl className="contador">
        <div className="contador__fila contador__fila--principal">
          <dt>Acciones del agente</dt>
          <dd className="cifra">{agente}</dd>
        </div>
        <div className="contador__fila contador__fila--principal">
          <dt>Acciones humanas</dt>
          <dd className="cifra">{humano}</dd>
        </div>
        <div className="contador__fila">
          <dt>Validaciones del motor de reglas</dt>
          <dd className="cifra">{reglas}</dd>
        </div>
      </dl>
    </section>
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

  if (error) {
    return (
      <p className="aviso aviso--error" role="alert">
        No se pudo leer el evento {id}: {error} <a href="#/">Volver a la lista</a>
      </p>
    );
  }
  if (!lectura) return <p className="vacio">Cargando evento…</p>;

  const sinConexion = lectura.origen === 'ejemplo';
  const evento = lectura.datos;
  if (evento === null) {
    return (
      <>
        {sinConexion && <AvisoSinConexion />}
        <p className="vacio">
          {sinConexion ? `El evento ${id} no está entre los datos de ejemplo.` : `No existe el evento ${id}.`}{' '}
          <a href="#/">Volver a la lista</a>
        </p>
      </>
    );
  }

  const { totales } = evento;
  const hayCobro = totales.cobradoMXN > 0;

  return (
    <article className="evento">
      <a href="#/" className="regreso">
        ← Eventos
      </a>
      {sinConexion && <AvisoSinConexion />}
      <header className="evento__encabezado">
        <div>
          <h1 className="titulo">{evento.nombre}</h1>
          <p className="evento__datos">
            {fechaLarga(evento.fecha)} · {evento.asistentes} asistentes
          </p>
        </div>
        <span className="estado estado--evento" data-estado={evento.estado}>
          {ETIQUETA_ESTADO_EVENTO[evento.estado]}
        </span>
      </header>

      <dl className="cifras">
        <Cifra etiqueta="Presupuesto" valor={mxn(evento.presupuestoMXN)} />
        <Cifra
          etiqueta="Techo"
          valor={mxn(evento.techoMXN)}
          nota={`Presupuesto + ${porcentaje(evento.margen)} de margen`}
        />
        <Cifra
          etiqueta="Total cobrado"
          valor={mxn(totales.cobradoMXN)}
          nota={hayCobro ? undefined : `Cotizado: ${mxn(totales.cotizadoMXN)}`}
        />
        <Cifra
          etiqueta="Costo por asistente"
          valor={mxn(totales.costoPorAsistenteMXN)}
          nota={hayCobro ? undefined : 'Sobre lo cotizado'}
        />
      </dl>

      <BarraAvance evento={evento} />
      <LibroMovimientos evento={evento} />

      <div className="evento__pie">
        <LineaTiempo evento={evento} />
        <Contador evento={evento} />
      </div>
    </article>
  );
}
