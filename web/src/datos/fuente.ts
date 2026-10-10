import type { Brief, Evento } from '../tipos';
import ejemplo from './eventos-ejemplo.json';

// Única puerta de datos de la web: las pantallas no llaman a fetch ni leen el JSON de ejemplo.
//
// - Las lecturas van a la API; si la API no responde (backend apagado) devuelven
//   los datos de ejemplo y lo declaran en `origen` para que la pantalla lo diga.
// - Crear y ejecutar nunca se simulan: sin backend fallan con ErrorSinConexion.
// - Una respuesta HTTP de error (400, 404, 500) se lanza como ErrorApi con el mensaje del backend.

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/+$/, '');

const ESPERA_LECTURA_MS = 4_000;
const ESPERA_CREAR_MS = 10_000;
// Ejecutar cotiza y paga partida por partida; contra Reap real puede tardar.
const ESPERA_EJECUTAR_MS = 120_000;

const eventosEjemplo = ejemplo as Evento[];

export type Origen = 'api' | 'ejemplo';

export interface Lectura<T> {
  datos: T;
  origen: Origen;
}

/** El backend respondió con un estado HTTP de error. `message` es el texto que mandó el backend. */
export class ErrorApi extends Error {
  readonly status: number;

  constructor(status: number, mensaje: string) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.status = status;
  }
}

/** No hubo respuesta del backend: apagado, inalcanzable o sin contestar a tiempo. */
export class ErrorSinConexion extends Error {
  constructor(accion: string) {
    super(`Sin conexión al backend (${API_URL}): ${accion}. Arranca el backend y vuelve a intentar.`);
    this.name = 'ErrorSinConexion';
  }
}

export function urlApi(): string {
  return API_URL;
}

/** Texto para mostrar al usuario a partir de cualquier error de esta capa. */
export function mensajeDeError(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  return 'Error inesperado';
}

async function pedir<T>(metodo: 'GET' | 'POST', ruta: string, esperaMs: number, accion: string, cuerpo?: unknown): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(`${API_URL}${ruta}`, {
      method: metodo,
      headers: cuerpo === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(esperaMs),
    });
  } catch {
    // fetch solo rechaza cuando no hay respuesta: red caída, conexión rechazada, CORS o tiempo agotado.
    throw new ErrorSinConexion(accion);
  }

  let json: unknown = null;
  try {
    json = await respuesta.json();
  } catch {
    // Cuerpo vacío o que no es JSON: se resuelve abajo según el estado.
  }

  if (!respuesta.ok) {
    const error = (json as { error?: unknown } | null)?.error;
    throw new ErrorApi(
      respuesta.status,
      typeof error === 'string' && error ? error : `El backend respondió ${respuesta.status} sin mensaje`,
    );
  }
  if (json === null) throw new ErrorApi(respuesta.status, 'El backend respondió algo que no es JSON');
  return json as T;
}

export async function listarEventos(): Promise<Lectura<Evento[]>> {
  try {
    return { datos: await pedir<Evento[]>('GET', '/api/eventos', ESPERA_LECTURA_MS, 'no se pudo leer la lista'), origen: 'api' };
  } catch (e) {
    if (e instanceof ErrorSinConexion) return { datos: eventosEjemplo, origen: 'ejemplo' };
    throw e;
  }
}

/** `datos` es null cuando el evento no existe (404 del backend, o no está entre los ejemplos). */
export async function obtenerEvento(id: string): Promise<Lectura<Evento | null>> {
  try {
    const evento = await pedir<Evento>('GET', `/api/eventos/${encodeURIComponent(id)}`, ESPERA_LECTURA_MS, 'no se pudo leer el evento');
    return { datos: evento, origen: 'api' };
  } catch (e) {
    if (e instanceof ErrorSinConexion) return { datos: eventosEjemplo.find((x) => x.id === id) ?? null, origen: 'ejemplo' };
    if (e instanceof ErrorApi && e.status === 404) return { datos: null, origen: 'api' };
    throw e;
  }
}

/** Crea el evento en estado `borrador`. Lanza ErrorApi (400 con el motivo de validación) o ErrorSinConexion. */
export function crearEvento(brief: Brief): Promise<Evento> {
  return pedir<Evento>('POST', '/api/eventos', ESPERA_CREAR_MS, 'no se puede crear el evento', brief);
}

/** Corre el plan del evento y devuelve el evento ya resuelto. Lanza ErrorApi (404) o ErrorSinConexion. */
export function ejecutarEvento(id: string): Promise<Evento> {
  return pedir<Evento>('POST', `/api/eventos/${encodeURIComponent(id)}/ejecutar`, ESPERA_EJECUTAR_MS, 'no se puede ejecutar el evento');
}

/** Recotiza las partidas no logradas o bloqueadas y crea cargos nuevos por aprobar. Lanza ErrorApi (400/409) o ErrorSinConexion. */
export function reintentarEvento(id: string): Promise<Evento> {
  return pedir<Evento>('POST', `/api/eventos/${encodeURIComponent(id)}/reintentar`, ESPERA_EJECUTAR_MS, 'no se puede reintentar el evento');
}
