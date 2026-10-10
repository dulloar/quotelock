import { useEffect, useState } from 'react';
import { listarEventos, mensajeDeError } from '../datos/fuente';
import type { Lectura } from '../datos/fuente';
import { ETIQUETA_ESTADO_EVENTO, fechaLarga, mxn, porcentaje } from '../formato';
import type { Evento } from '../tipos';
import { AvisoSinConexion } from './AvisoSinConexion';

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

  return (
    <section>
      <div className="encabezado-lista">
        <h1 className="titulo">Eventos</h1>
        <a href="#/nuevo" className="boton">
          Nuevo evento
        </a>
      </div>

      {lectura?.origen === 'ejemplo' && <AvisoSinConexion />}
      {error && (
        <p className="aviso aviso--error" role="alert">
          No se pudo leer la lista de eventos: {error}
        </p>
      )}

      {!eventos && !error && <p className="vacio">Cargando eventos…</p>}
      {eventos && eventos.length === 0 && (
        <p className="vacio">
          Todavía no hay eventos. <a href="#/nuevo">Crea el primero</a>.
        </p>
      )}
      {eventos && eventos.length > 0 && (
        <ul className="lista-eventos">
          {eventos.map((e) => (
            <li key={e.id}>
              <a href={`#/eventos/${e.id}`} className="fila-evento">
                <span className="fila-evento__nombre">{e.nombre}</span>
                <span className="fila-evento__dato">{fechaLarga(e.fecha)}</span>
                <span className="fila-evento__dato cifra">
                  {mxn(e.presupuestoMXN)} + {porcentaje(e.margen)}
                </span>
                <span className="estado" data-estado={e.estado}>
                  {ETIQUETA_ESTADO_EVENTO[e.estado]}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
