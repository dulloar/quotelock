import http from 'node:http';
import type { Evento } from './tipos.ts';
import { redondear } from './tipos.ts';
import { Store } from './store.ts';
import { validarBrief } from './validacion.ts';
import type { Deps } from './orquestador.ts';
import { ejecutar, refrescar, reintentar } from './orquestador.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function enviar(res: http.ServerResponse, status: number, cuerpo: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...CORS });
  res.end(JSON.stringify(cuerpo));
}

function leerCuerpo(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => {
      s += c;
      if (s.length > 1_000_000) reject(new Error('cuerpo demasiado grande'));
    });
    req.on('end', () => resolve(s));
    req.on('error', reject);
  });
}

export function crearServidor(deps: Deps, store: Store = new Store()): http.Server {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        res.end();
        return;
      }
      const ruta = (req.url ?? '/').split('?')[0].replace(/\/+$/, '');
      const metodo = req.method ?? 'GET';

      if (ruta === '/api/eventos' && metodo === 'GET') return enviar(res, 200, store.listar());

      if (ruta === '/api/eventos' && metodo === 'POST') {
        let json: unknown;
        try {
          json = JSON.parse(await leerCuerpo(req));
        } catch {
          return enviar(res, 400, { error: 'JSON inválido' });
        }
        const v = validarBrief(json);
        if (!v.ok) return enviar(res, 400, { error: v.error });
        const b = v.brief;
        const evento: Evento = {
          id: store.siguienteId(),
          nombre: b.nombre,
          fecha: b.fecha,
          asistentes: b.asistentes,
          presupuestoMXN: b.presupuestoMXN,
          margen: b.margen,
          techoMXN: redondear(b.presupuestoMXN * (1 + b.margen)),
          estado: 'borrador',
          modoSimulado: deps.reap.modoSimulado || deps.reap.modoPago === 'simulado',
          modoPago: deps.reap.modoPago,
          totales: { presupuestadoMXN: b.presupuestoMXN, cotizadoMXN: 0, cobradoMXN: 0, costoPorAsistenteMXN: 0 },
          partidas: [],
          timeline: [],
        };
        if (b.notas !== undefined) evento.notas = b.notas;
        store.guardar(evento);
        return enviar(res, 201, evento);
      }

      const m = ruta.match(/^\/api\/eventos\/([^/]+)(\/ejecutar|\/reintentar)?$/);
      if (m) {
        const evento = store.obtener(m[1]);
        if (!evento) return enviar(res, 404, { error: 'Evento no encontrado' });
        if (!m[2] && metodo === 'GET') {
          await refrescar(deps, evento, store.interno(evento.id));
          return enviar(res, 200, evento);
        }
        if (m[2] === '/reintentar' && metodo === 'POST') {
          const r = await reintentar(deps, evento, store.interno(evento.id));
          return r.ok ? enviar(res, 200, r.evento) : enviar(res, 409, { error: r.error });
        }
        if (m[2] === '/ejecutar' && metodo === 'POST') {
          await ejecutar(deps, evento, store.interno(evento.id));
          return enviar(res, 200, evento);
        }
      }
      return enviar(res, 404, { error: 'Ruta no encontrada' });
    } catch (e) {
      // Nunca incluir secretos en la respuesta.
      return enviar(res, 500, { error: e instanceof Error ? e.message : 'Error interno' });
    }
  });
}
