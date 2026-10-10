import { useEffect, useState } from 'react';
import { listarEventos, mensajeDeError } from '../datos/fuente';
import type { Lectura } from '../datos/fuente';
import { ETIQUETA_ESTADO_EVENTO, fechaLarga, mxn, porcentaje } from '../formato';
import type { EstadoEvento, Evento } from '../tipos';
import { AvisoSinConexion } from './AvisoSinConexion';

// Cada estado lleva su forma además del color: círculo, triángulo, octágono, círculo punteado y reloj de arena.
const ICONO_ESTADO: Record<EstadoEvento, string> = {
  pagado: '#i-cabe',
  ajustado: '#i-margen',
  revision_humana: '#i-alto-inv',
  borrador: '#i-borrador',
  por_aprobar: '#i-espera',
};

export function ListaEventos() {
  const [lectura, setLectura] = useState<Lectura<Evento[]> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vigente = true;
    listarEventos()
      .then((l) => vigente && setLectura(l))
      .catch((e) => vigente && setError(mensajeDeError(e)));
    return () => {
      vigente = false;
    };
  }, []);

  const eventos = lectura?.datos;
  const enRevision = eventos?.filter((e) => e.estado === 'revision_humana').length ?? 0;
  const porAprobar = eventos?.filter((e) => e.estado === 'por_aprobar').length ?? 0;

  return (
    <section className="lista" aria-labelledby="lista-titulo">
      <header className="cabecera">
        <h1 className="titulo" id="lista-titulo">
          Tus eventos
        </h1>
        <p className="entrada">Abre uno y te cuento qué hice con su dinero.</p>
      </header>

      {lectura?.origen === 'ejemplo' && <AvisoSinConexion />}
      {error && (
        <div className="aviso aviso--error" role="alert">
          <svg className="ic" aria-hidden="true">
            <use href="#i-error" />
          </svg>
          <p>No pude leer tus eventos: {error}</p>
        </div>
      )}

      {!eventos && !error && (
        <p className="vacio" role="status">
          Estoy leyendo tus eventos…
        </p>
      )}

      {eventos && eventos.length === 0 && (
        <div className="sin-eventos">
          <h2 className="sin-eventos__titulo">Todavía no cuido ningún evento.</h2>
          <p>Dime cuánto puedo gastar en el primero y yo me encargo de que no se pase del techo.</p>
          <a href="#/nuevo" className="boton boton--principal">
            <svg className="ic" aria-hidden="true">
              <use href="#i-mas" />
            </svg>
            Crear el primer evento
          </a>
        </div>
      )}

      {eventos && eventos.length > 0 && (
        <>
          {enRevision > 0 && (
            <p className="lista__pendiente">
              <svg className="ic" aria-hidden="true">
                <use href="#i-alto" />
              </svg>
              <span>
                {enRevision === 1
                  ? 'Me detuve en 1 evento: necesito que lo revises.'
                  : `Me detuve en ${enRevision} eventos: necesito que los revises.`}
              </span>
            </p>
          )}
          {porAprobar > 0 && (
            <p className="lista__pendiente lista__pendiente--aprobar">
              <svg className="ic" aria-hidden="true">
                <use href="#i-espera" />
              </svg>
              <span>
                {porAprobar === 1
                  ? 'Tengo cargos listos en 1 evento: falta tu aprobación.'
                  : `Tengo cargos listos en ${porAprobar} eventos: falta tu aprobación.`}
              </span>
            </p>
          )}
          <ul className="lista-eventos">
            {eventos.map((e) => (
              <li key={e.id}>
                <a href={`#/eventos/${e.id}`} className="fila-evento" data-estado={e.estado}>
                  <span className="fila-evento__principal">
                    <span className="fila-evento__nombre">{e.nombre}</span>
                    <span className="fila-evento__dato">{fechaLarga(e.fecha)}</span>
                  </span>
                  <span className="fila-evento__dinero cifra">
                    <span className="fila-evento__rotulo">Presupuesto</span> <b>{mxn(e.presupuestoMXN)}</b> +{' '}
                    {porcentaje(e.margen)} de margen
                  </span>
                  <span className="estado" data-estado={e.estado}>
                    <svg className="ic" aria-hidden="true">
                      <use href={ICONO_ESTADO[e.estado] ?? '#i-borrador'} />
                    </svg>
                    {ETIQUETA_ESTADO_EVENTO[e.estado] ?? e.estado}
                  </span>
                  <svg className="ic fila-evento__ir" aria-hidden="true">
                    <use href="#i-ir" />
                  </svg>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
