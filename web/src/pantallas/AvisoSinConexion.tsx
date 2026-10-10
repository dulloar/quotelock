import { urlApi } from '../datos/fuente';

/** Se muestra cuando una lectura cayó a los datos de ejemplo porque el backend no respondió. */
export function AvisoSinConexion() {
  return (
    <div className="aviso aviso--atencion" role="status">
      <svg className="ic" aria-hidden="true">
        <use href="#i-sin-conexion" />
      </svg>
      <p>
        <strong>Sin conexión al backend: mostrando datos de ejemplo.</strong> No me respondió{' '}
        <span className="aviso__dato">{urlApi()}</span>. Lo que ves no es real, y no puedo crear ni ejecutar eventos
        hasta que vuelva.
      </p>
    </div>
  );
}
