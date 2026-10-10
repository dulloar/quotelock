import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { BRIEFS_DE_PRUEBA, CAMPOS_VACIOS, MARGENES, leerMargen, leerNumero, techoMXN, validarCampos } from '../brief';
import type { Campo, CamposBrief, ErroresBrief } from '../brief';
import { crearEvento, ejecutarEvento, mensajeDeError } from '../datos/fuente';
import { mxn, porcentaje } from '../formato';

const ORDEN: Campo[] = ['nombre', 'fecha', 'asistentes', 'presupuesto', 'margen'];

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

  const atributosError = (campo: Campo) => ({
    'aria-invalid': errores[campo] ? (true as const) : undefined,
    'aria-describedby': errores[campo] ? `error-${campo}` : undefined,
  });

  const mensaje = (campo: Campo) =>
    errores[campo] && (
      <p className="campo__error" id={`error-${campo}`}>
        {errores[campo]}
      </p>
    );

  return (
    <section className="nuevo">
      <a href="#/" className="regreso">
        ← Eventos
      </a>
      <h1 className="titulo">Nuevo evento</h1>

      <div className="pruebas" role="group" aria-labelledby="pruebas-titulo">
        <h2 className="subtitulo" id="pruebas-titulo">
          Briefs de prueba
        </h2>
        <ul className="pruebas__lista">
          {BRIEFS_DE_PRUEBA.map((b) => (
            <li key={b.clave}>
              <button type="button" className="prueba" data-caso={b.clave} onClick={() => precargar(b.campos)} disabled={enviando}>
                <span className="prueba__titulo">{b.titulo}</span>
                <span className="cifra">
                  {mxn(Number(b.campos.presupuesto))} + {porcentaje(Number(b.campos.margen))}
                </span>
                <span className="prueba__esperado">{b.esperado}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="pruebas__nota">Llenan el formulario; nada se envía hasta que presionas Ejecutar.</p>
      </div>

      <form className="formulario" ref={formulario} onSubmit={enviar} noValidate>
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
          {mensaje('asistentes')}
        </div>

        <div className="campo">
          <label htmlFor="presupuesto">Presupuesto (MXN)</label>
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
          {mensaje('presupuesto')}
        </div>

        <fieldset className="campo" {...atributosError('margen')}>
          <legend>Margen</legend>
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
                <span className="cifra">{porcentaje(m)}</span>
              </label>
            ))}
          </div>
          {mensaje('margen')}
        </fieldset>

        <div className="techo campo--ancho" aria-live="polite">
          <span className="techo__etiqueta">Techo de gasto</span>
          <output className="techo__valor cifra">{techo === null ? '—' : mxn(techo)}</output>
          <span className="techo__nota">
            {techo === null || margen === undefined
              ? 'Presupuesto × (1 + margen). Escribe el presupuesto para verlo.'
              : `${mxn(presupuesto)} + ${porcentaje(margen)} de margen. Arriba de esto el agente no paga: se detiene.`}
          </span>
        </div>

        <div className="formulario__pie campo--ancho">
          <button type="submit" className="boton boton--principal" disabled={enviando} aria-busy={enviando || undefined}>
            {enviando ? 'Ejecutando…' : 'Ejecutar'}
          </button>
          {errorEnvio && (
            <p className="aviso aviso--error" role="alert">
              {errorEnvio.idCreado ? (
                <>
                  El evento <a href={`#/eventos/${errorEnvio.idCreado}`}>{errorEnvio.idCreado}</a> se creó pero no se pudo
                  ejecutar: {errorEnvio.mensaje}
                </>
              ) : (
                <>No se pudo crear el evento: {errorEnvio.mensaje}</>
              )}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
