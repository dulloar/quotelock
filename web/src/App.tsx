import { useEffect, useState } from 'react';
import { ListaEventos } from './pantallas/ListaEventos';
import { NuevoEvento } from './pantallas/NuevoEvento';
import { PantallaEvento } from './pantallas/PantallaEvento';

function rutaActual(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function App() {
  const [ruta, setRuta] = useState(rutaActual);

  useEffect(() => {
    const alCambiar = () => setRuta(rutaActual());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);

  const idEvento = ruta.match(/^\/eventos\/([^/]+)$/)?.[1];

  return (
    <div className="pagina">
      <header className="barra">
        <a href="#/" className="marca">
          QuoteLock
        </a>
        <span className="barra__lema">El agente no compra: gobierna el dinero del evento</span>
      </header>
      <main>
        {idEvento ? <PantallaEvento id={idEvento} /> : ruta === '/nuevo' ? <NuevoEvento /> : <ListaEventos />}
      </main>
    </div>
  );
}
