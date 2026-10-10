import type { Evento } from '../tipos';
import ejemplo from './eventos-ejemplo.json';

// Única puerta de datos de la web. Hoy lee el archivo de ejemplo;
// en F4 estas funciones llaman a http://localhost:3001 sin tocar las pantallas.
const eventos = ejemplo as Evento[];

export async function listarEventos(): Promise<Evento[]> {
  return eventos;
}

export async function obtenerEvento(id: string): Promise<Evento | null> {
  return eventos.find((e) => e.id === id) ?? null;
}
