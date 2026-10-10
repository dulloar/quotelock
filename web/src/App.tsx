import { useEffect, useState } from 'react';
import { ListaEventos } from './pantallas/ListaEventos';
import { NuevoEvento } from './pantallas/NuevoEvento';
import { PantallaEvento } from './pantallas/PantallaEvento';

function rutaActual(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

/**
 * Iconos de toda la web, una sola vez. Se usan con
 * `<svg className="ic" aria-hidden="true"><use href="#i-cabe" /></svg>`.
 * Cada estado tiene forma propia: círculo = cabe, triángulo = margen, octágono = alto, escudo = reglas.
 */
function Iconos() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <symbol id="i-logo" viewBox="0 0 24 24">
        <rect x="1.5" y="8" width="21" height="8" rx="4" fill="none" stroke="currentColor" strokeWidth="2.4" />
        <path d="M17 4v16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </symbol>
      <symbol id="i-cabe" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="11" fill="currentColor" />
        <path
          d="M6.8 12.4l3.4 3.4 7-7.4"
          fill="none"
          stroke="var(--superficie)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </symbol>
      <symbol id="i-margen" viewBox="0 0 24 24">
        <path d="M12 2.6L22.6 21H1.4z" fill="currentColor" stroke="var(--margen-tinta)" strokeWidth="1.4" strokeLinejoin="round" />
        <path
          d="M12 17.6v-7.4M8.8 13l3.2-3.2 3.2 3.2"
          fill="none"
          stroke="var(--tinta)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </symbol>
      <symbol id="i-alto" viewBox="0 0 24 24">
        <path d="M7.4 1h9.2L23 7.4v9.2L16.6 23H7.4L1 16.6V7.4z" fill="currentColor" />
        <path d="M6.5 12h11" stroke="var(--sobre-alto)" strokeWidth="3" strokeLinecap="round" />
      </symbol>
      <symbol id="i-alto-inv" viewBox="0 0 24 24">
        <path d="M7.4 1h9.2L23 7.4v9.2L16.6 23H7.4L1 16.6V7.4z" fill="var(--sobre-alto)" />
        <path d="M6.5 12h11" stroke="var(--alto)" strokeWidth="3" strokeLinecap="round" />
      </symbol>
      <symbol id="i-reglas" viewBox="0 0 24 24">
        <path d="M12 1.2l9.3 3.3v6.9c0 5.4-3.8 9.4-9.3 11.4C6.5 20.8 2.7 16.8 2.7 11.4V4.5z" fill="currentColor" />
        <path d="M8.6 8.4l6.8 6.8M15.4 8.4l-6.8 6.8" stroke="var(--superficie)" strokeWidth="2.3" strokeLinecap="round" />
      </symbol>
      <symbol id="i-borrador" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeDasharray="4 3.55" />
        <circle cx="12" cy="12" r="2.6" fill="currentColor" />
      </symbol>
      <symbol id="i-error" viewBox="0 0 24 24">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="currentColor" />
        <path d="M12 6.6v7" stroke="var(--sobre-alto)" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="12" cy="17.4" r="1.5" fill="var(--sobre-alto)" />
      </symbol>
      <symbol id="i-sin-conexion" viewBox="0 0 24 24">
        <path
          d="M7 18.5h10.2a4.3 4.3 0 0 0 .7-8.54A6 6 0 0 0 6.3 9.2 4.7 4.7 0 0 0 7 18.5z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M4 3.5l16 17.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </symbol>
      <symbol id="i-mas" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      </symbol>
      <symbol id="i-ir" viewBox="0 0 24 24">
        <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </symbol>
    </svg>
  );
}

export function App() {
  const [ruta, setRuta] = useState(rutaActual);

  useEffect(() => {
    const alCambiar = () => setRuta(rutaActual());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  const idEvento = ruta.match(/^\/eventos\/([^/]+)$/)?.[1];
  const enNuevo = !idEvento && ruta === '/nuevo';
  const enLista = !idEvento && !enNuevo;

  return (
    <div className="pagina">
      <Iconos />
      <header className="barra">
        <a href="#/" className="marca" aria-label="QuoteLock, ir a tus eventos">
          <svg className="ic" aria-hidden="true">
            <use href="#i-logo" />
          </svg>
          QuoteLock
        </a>
        <nav className="barra__nav" aria-label="Principal">
          <a href="#/" className="barra__enlace" aria-current={enLista ? 'page' : idEvento ? 'true' : undefined}>
            Eventos
          </a>
          <a href="#/nuevo" className="boton boton--principal barra__nuevo" aria-current={enNuevo ? 'page' : undefined}>
            <svg className="ic" aria-hidden="true">
              <use href="#i-mas" />
            </svg>
            Nuevo evento
          </a>
        </nav>
      </header>
      <main>
        {idEvento ? <PantallaEvento id={idEvento} /> : enNuevo ? <NuevoEvento /> : <ListaEventos />}
      </main>
    </div>
  );
}
