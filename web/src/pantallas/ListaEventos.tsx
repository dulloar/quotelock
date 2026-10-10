import { useEffect, useState } from 'react';
import { listarEventos } from '../datos/fuente';
import { ETIQUETA_ESTADO_EVENTO, fechaLarga, mxn, porcentaje } from '../formato';
import type { Evento } from '../tipos';

export function ListaEventos() {
  const [eventos, setEventos] = useState<Evento[] | null>(null);

  useEffect(() => {
    listarEventos().then(setEventos);
  }, []);

  if (!eventos) return <p className="vacio">Cargando eventos…</p>;
  if (eventos.length === 0) return <p className="vacio">Todavía no hay eventos.</p>;

  return (
    <section>
      <h1 className="titulo">Eventos</h1>
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
    </section>
  );
}
