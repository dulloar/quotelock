import { useRef, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { BRIEFS_DE_PRUEBA, CAMPOS_VACIOS, MARGENES, leerMargen, leerNumero, techoMXN, validarCampos } from '../brief';
import type { Campo, CamposBrief, ErroresBrief } from '../brief';
import { crearEvento, ejecutarEvento, mensajeDeError } from '../datos/fuente';
import { mxn, porcentaje } from '../formato';

const ORDEN: Campo[] = ['nombre', 'fecha', 'asistentes', 'presupuesto', 'margen'];

// Campos con una línea de ayuda debajo; su id se suma al aria-describedby.
const CON_AYUDA: Campo[] = ['nombre', 'asistentes', 'presupuesto', 'margen'];

interface ErrorEnvio {
  mensaje: string;
  /** Si el evento ya se creó y lo que falló fue ejecutarlo, su id. */
  idCreado?: string;
}

export function NuevoEvento() {
  const [campos, setCampos] = useState<CamposBrief>(CAMPOS_VACIOS);
  const [errores, setErrores] = useState<ErroresBrief>({});
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<ErrorEnvio | null>(null);

  const formulario = useRef<HTMLFormElement>(null);
  // Candado contra el doble envío: el estado `enviando` tarda un render en deshabilitar el botón.
  const enCurso = useRef(false);
  // Evento ya creado cuya ejecución falló: si se reintenta con el mismo brief no se crea otro.
  const creado = useRef<{ id: string; firma: string } | null>(null);

  const presupuesto = leerNumero(campos.presupuesto);
  const margen = leerMargen(campos.margen);
  const techo = Number.isFinite(presupuesto) && presupuesto > 0 && margen !== undefined ? techoMXN(presupuesto, margen) : null;

  function cambiar(campo: Campo, valor: string) {
    setCampos((c) => ({ ...c, [campo]: valor }));
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  function precargar(c: CamposBrief) {
    setCampos(c);
    setErrores({});
    setErrorEnvio(null);
  }

  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (enCurso.current) return;

    const v = validarCampos(campos);
    setErrores(v.errores);
    if (!v.brief) {
      const primero = ORDEN.find((c) => v.errores[c]);
      if (primero) formulario.current?.querySelector<HTMLElement>(`[name="${primero}"]`)?.focus();
      return;
    }

    enCurso.current = true;
    setEnviando(true);
    setErrorEnvio(null);

    const firma = JSON.stringify(v.brief);
    let id = creado.current?.firma === firma ? creado.current.id : undefined;
    try {
      if (!id) {
        id = (await crearEvento(v.brief)).id;
        creado.current = { id, firma };
      }
      await ejecutarEvento(id);
      creado.current = null;
      window.location.hash = `#/eventos/${id}`;
    } catch (e) {
      setErrorEnvio({ mensaje: mensajeDeError(e), idCreado: id });
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }

  // Solo presentación: cuánto dinero es el margen y qué parte de la barra ocupa el presupuesto.
  // El techo que manda es el de techoMXN(); la holgura sale de él para que la suma siempre cuadre.
  const hayPresupuesto = Number.isFinite(presupuesto) && presupuesto > 0;
  const holgura = (m: number) => Math.round((techoMXN(presupuesto, m) - presupuesto) * 100) / 100;
  const estiloBarra = { '--b': `${(100 / (1 + (margen ?? 0.2))).toFixed(3)}%` } as CSSProperties;

  const atributosError = (campo: Campo) => ({
    'aria-invalid': errores[campo] ? (true as const) : undefined,
    'aria-describedby':
      [CON_AYUDA.includes(campo) ? `ayuda-${campo}` : '', errores[campo] ? `error-${campo}` : ''].filter(Boolean).join(' ') ||
      undefined,
  });

  const mensaje = (campo: Campo) =>
    errores[campo] && (
      <p className="campo__error" id={`error-${campo}`}>
        <svg className="ic" aria-hidden="true">
          <use href="#i-error" />
        </svg>
        <span>{errores[campo]}</span>
      </p>
    );

  return (
    <section className="nuevo" aria-labelledby="nuevo-titulo">
      <header className="cabecera">
        <h1 className="titulo" id="nuevo-titulo">
          Dime cuánto puedo gastar
        </h1>
        <p className="entrada">
          Tú pones el presupuesto y el margen. Yo cotizo, pago lo que cabe y me detengo si se pasa del techo.
        </p>
      </header>

      <form className="formulario" ref={formulario} onSubmit={enviar} noValidate aria-labelledby="nuevo-titulo">
        <div className="formulario__campos">
          <div className="campo campo--ancho">
            <label htmlFor="nombre">Nombre del evento</label>
            <input
              id="nombre"
              name="nombre"
              type="text"
              autoComplete="off"
              value={campos.nombre}
              onChange={(e) => cambiar('nombre', e.target.value)}
              {...atributosError('nombre')}
            />
            <p className="campo__ayuda" id="ayuda-nombre">
              Así lo vas a encontrar en tu lista.
            </p>
            {mensaje('nombre')}
          </div>

          <div className="campo">
            <label htmlFor="fecha">Fecha</label>
            <input
              id="fecha"
              name="fecha"
              type="date"
              value={campos.fecha}
              onChange={(e) => cambiar('fecha', e.target.value)}
              {...atributosError('fecha')}
            />
            {mensaje('fecha')}
          </div>

          <div className="campo">
            <label htmlFor="asistentes">Asistentes</label>
            <input
              id="asistentes"
              name="asistentes"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className="cifra"
              value={campos.asistentes}
              onChange={(e) => cambiar('asistentes', e.target.value)}
              {...atributosError('asistentes')}
            />
            <p className="campo__ayuda" id="ayuda-asistentes">
              Para sacar el costo por persona.
            </p>
            {mensaje('asistentes')}
          </div>

          <div className="campo campo--ancho">
            <label htmlFor="presupuesto">Presupuesto</label>
            <div className="campo__caja">
              <span className="campo__prefijo" aria-hidden="true">
                $
              </span>
              <input
                id="presupuesto"
                name="presupuesto"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                className="cifra"
                value={campos.presupuesto}
                onChange={(e) => cambiar('presupuesto', e.target.value)}
                {...atributosError('presupuesto')}
              />
            </div>
            <p className="campo__ayuda" id="ayuda-presupuesto">
              En pesos mexicanos (MXN). Es lo que planeas gastar en total.
            </p>
            {mensaje('presupuesto')}
          </div>

          <fieldset className="campo campo--ancho" {...atributosError('margen')}>
            <legend>Margen</legend>
            <p className="campo__ayuda" id="ayuda-margen">
              Es cuánto me dejas pasarme del presupuesto si los precios salen más altos.
            </p>
            <div className="opciones">
              {MARGENES.map((m) => (
                <label key={m} className="opcion">
                  <input
                    type="radio"
                    name="margen"
                    value={String(m)}
                    checked={campos.margen === String(m)}
                    onChange={(e) => cambiar('margen', e.target.value)}
                  />
                  <span className="opcion__valor cifra">{porcentaje(m)}</span>
                  <span className="opcion__nota cifra">{hayPresupuesto ? `hasta ${mxn(holgura(m))} más` : 'del presupuesto'}</span>
                </label>
              ))}
            </div>
            {mensaje('margen')}
          </fieldset>
        </div>

        <div className="formulario__lado">
          <div className="techo" aria-live="polite">
            <p className="techo__etiqueta">Tu techo: de aquí no paso</p>
            <output className="techo__valor cifra">{techo === null ? '—' : mxn(techo)}</output>
            <div className="techo__barra" style={estiloBarra} data-vacia={techo === null || undefined} aria-hidden="true">
              <i className="techo__pres" />
              <i className="techo__margen" />
              <i className="techo__muro" />
            </div>
            {techo === null || margen === undefined ? (
              <p className="techo__nota">Escribe el presupuesto y te digo cuál es. Presupuesto + margen = techo.</p>
            ) : (
              <>
                <ul className="techo__partes cifra">
                  <li>
                    <i className="techo__muestra techo__muestra--pres" aria-hidden="true" />
                    <span>Presupuesto</span>
                    <b>{mxn(presupuesto)}</b>
                  </li>
                  <li>
                    <i className="techo__muestra techo__muestra--margen" aria-hidden="true" />
                    <span>Margen de {porcentaje(margen)}</span>
                    <b>+ {mxn(holgura(margen))}</b>
                  </li>
                  <li>
                    <i className="techo__muestra techo__muestra--muro" aria-hidden="true" />
                    <span>Techo</span>
                    <b>{mxn(techo)}</b>
                  </li>
                </ul>
                <p className="techo__nota">Si la mejor cotización rebasa el techo, no pago nada: me detengo y te pido que revises.</p>
              </>
            )}
          </div>

          <div className="formulario__pie">
            <button type="submit" className="boton boton--principal boton--grande" disabled={enviando} aria-busy={enviando || undefined}>
              {enviando ? 'Ejecutando…' : 'Ejecutar'}
            </button>
            <p className="formulario__estado" role="status">
              {enviando
                ? 'Estoy cotizando y validando contra tu techo. No cierres esta pantalla.'
                : 'Al ejecutar cotizo, valido cada compra contra tu techo y pago solo lo que cabe.'}
            </p>
            {errorEnvio && (
              <div className="aviso aviso--error" role="alert">
                <svg className="ic" aria-hidden="true">
                  <use href="#i-error" />
                </svg>
                <p>
                  {errorEnvio.idCreado ? (
                    <>
                      Creé el evento <a href={`#/eventos/${errorEnvio.idCreado}`}>{errorEnvio.idCreado}</a>, pero no pude
                      ejecutarlo: {errorEnvio.mensaje}
                    </>
                  ) : (
                    <>No pude crear el evento: {errorEnvio.mensaje}</>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>
      </form>

      <section className="pruebas" aria-labelledby="pruebas-titulo">
        <h2 className="pruebas__titulo" id="pruebas-titulo">
          Atajos de demo
        </h2>
        <p className="pruebas__nota">Llenan el formulario por ti. No envío nada hasta que presionas Ejecutar.</p>
        <ul className="pruebas__lista">
          {BRIEFS_DE_PRUEBA.map((b) => (
            <li key={b.clave}>
              <button type="button" className="prueba" data-caso={b.clave} onClick={() => precargar(b.campos)} disabled={enviando}>
                <span className="prueba__titulo">{b.titulo}</span>
                <span className="prueba__cifra cifra">
                  {mxn(Number(b.campos.presupuesto))} + {porcentaje(Number(b.campos.margen))}
                </span>
                <span className="prueba__esperado">{b.esperado}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
