import type { CSSProperties } from 'react';
import { mxn } from '../formato';
import { barra } from './derivar';
import type { Cuentas } from './derivar';

// La medida protagonista: lo cobrado contra el techo, en una sola escala que va de $0 al mayor
// entre el techo y lo cotizado. El techo es un muro. En el alto no hay relleno: lo cotizado se
// dibuja en contorno, y lo que rebasa queda del otro lado del muro.

const pct = (n: number) => `${n}%`;

/** Un rótulo se ancla por la derecha a su marca; si la marca cae muy a la izquierda, por la izquierda. */
function ancla(pos: number): { style: CSSProperties; izq: boolean } {
  return pos < 46 ? { style: { left: pct(pos) }, izq: true } : { style: { right: pct(100 - pos) }, izq: false };
}

export function BarraTecho({ cuentas: c }: { cuentas: Cuentas }) {
  const b = barra(c);
  const sinCobro = b.cotizadoHastaTecho > 0;
  const aPres = ancla(b.presupuesto);
  const aTecho = ancla(b.techo);

  return (
    <>
      <div className="ev-barra" role="img" aria-label={b.aria}>
        <div className="ev-barra__margen">
          <span className={aTecho.izq ? 'ev-izq' : ''} style={aTecho.style}>
            El margen · {mxn(c.margenTotal)}
          </span>
          <i style={{ left: pct(b.presupuesto), width: pct(b.techo - b.presupuesto) }} />
        </div>

        <div className="ev-barra__pistas">
          <div className="ev-pista">
            <i className="ev-z-margen" style={{ left: pct(b.presupuesto), width: pct(b.techo - b.presupuesto) }} />
            {b.hayFuera && <i className="ev-z-fuera" style={{ left: pct(b.techo) }} />}
            {b.cobradoEnPresupuesto > 0 && <i className="ev-ll-cabe" style={{ width: pct(b.cobradoEnPresupuesto) }} />}
            {b.cobradoEnMargen > 0 && (
              <i className="ev-ll-margen" style={{ left: pct(b.presupuesto), width: pct(b.cobradoEnMargen) }} />
            )}
            {sinCobro && <i className="ev-ll-cotizado" style={{ width: pct(b.cotizadoHastaTecho) }} />}
            {b.cotizadoFuera > 0 && (
              <i className="ev-ll-rebasa" style={{ left: pct(b.techo), width: pct(b.cotizadoFuera) }} />
            )}
            {sinCobro && (
              <span className={`ev-pista__nota ${aTecho.izq ? 'ev-pista__nota--der' : ''}`}>
                Cotizado {mxn(c.cotizado)} · sin cobrar
              </span>
            )}
          </div>
          <i className="ev-marca-pres" style={{ left: pct(b.presupuesto) }} />
          <i className="ev-muro" style={{ left: pct(b.techo) }} />
        </div>

        <div className={`ev-barra__etqs ${aTecho.izq ? 'ev-barra__etqs--izq' : ''}`}>
          <span className="ev-etq ev-etq--cero">$0</span>
          <span className={`ev-etq ev-etq--pres ${aPres.izq ? 'ev-izq' : ''}`} style={aPres.style}>
            Presupuesto <b>{mxn(c.presupuesto)}</b>
          </span>
          <span className={`ev-etq ev-etq--techo ${aTecho.izq ? 'ev-izq' : ''}`} style={aTecho.style}>
            Techo <b>{mxn(c.techo)}</b>
          </span>
        </div>
      </div>

      <ul className="ev-clave" aria-label="Cómo leer la barra">
        {b.cobradoEnPresupuesto > 0 && (
          <li>
            <i className="ev-k ev-k--cabe" />
            Cobrado dentro del presupuesto
          </li>
        )}
        {b.cobradoEnMargen > 0 && (
          <li>
            <i className="ev-k ev-k--usado" />
            Margen usado
          </li>
        )}
        {sinCobro && (
          <li>
            <i className="ev-k ev-k--cotizado" />
            Cotizado, sin cobrar
          </li>
        )}
        <li>
          <i className="ev-k ev-k--margen" />
          {b.cobradoEnMargen > 0 ? 'Margen libre' : 'El margen'}
        </li>
        <li>
          <i className="ev-k ev-k--muro" />
          Techo: de aquí no paso
        </li>
        {b.cotizadoFuera > 0 && (
          <li>
            <i className="ev-k ev-k--rebasa" />
            Rebasa por {mxn(c.rebasaTecho)}
          </li>
        )}
      </ul>
    </>
  );
}
