import { urlApi } from '../datos/fuente';

/** Se muestra cuando una lectura cayó a los datos de ejemplo porque el backend no respondió. */
export function AvisoSinConexion() {
  return (
    <p className="aviso" role="status">
      <strong>Sin conexión al backend: mostrando datos de ejemplo.</strong> No hubo respuesta de{' '}
      <span className="cifra">{urlApi()}</span>. Lo que ves no es real y no se puede crear ni ejecutar eventos hasta que
      el backend esté arriba.
    </p>
  );
}
