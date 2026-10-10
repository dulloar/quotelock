import http from 'node:http';
import { Store } from './store.ts';
import { validarBrief } from './validacion.ts';
import type { Evento } from './tipos.ts';
import type { Deps } from './orquestador.ts';
import { ejecutar, refrescar, reintentar } from './orquestador.ts';
import { ErrorLlm, ejecutarConAgente } from './agente.ts';
import type { ConfigAgente } from './agente.ts';
import { crearEvento } from './herramientas.ts';
import { manejarMcpHttp } from './mcp.ts';

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

// Con agente configurado, el LLM decide; si falla, se cae al plan determinista (que sigue igual).
export async function ejecutarEvento(deps: Deps, store: Store, evento: Evento, agente?: ConfigAgente): Promise<Evento> {
  const interno = store.interno(evento.id);
  if (!agente || evento.estado !== 'borrador' || interno.ejecutando) return ejecutar(deps, evento, interno);
  evento.agente = 'llm';
  evento.modeloAgente = agente.modelo;
  evento.modoPago = deps.reap.modoPago;
  evento.modoSimulado = deps.reap.modoSimulado || deps.reap.modoPago === 'simulado';
  evento.timeline.push({ hora: deps.ahora().toISOString(), actor: 'agente', mensaje: `Agente LLM (${agente.modelo}) decidiendo con herramientas MCP` });
  try {
    await ejecutarConAgente(deps, store, evento, agente);
  } catch (e) {
    if (!(e instanceof ErrorLlm)) throw e;
    // Nada se cobró (crear_cargos termina el bucle): se descarta el borrador del LLM y se usa el plan determinista.
    evento.agente = 'determinista';
    evento.modeloAgente = null;
    evento.estado = 'borrador';
    evento.partidas = [];
    evento.totales.cotizadoMXN = 0;
    delete interno.llm;
    evento.timeline.push({ hora: deps.ahora().toISOString(), actor: 'reglas', mensaje: 'El agente LLM no respondió; se usó el plan determinista' });
    return ejecutar(deps, evento, interno);
  }
  return evento;
}

export function crearServidor(deps: Deps, store: Store = new Store(), opciones: { agente?: ConfigAgente } = {}): http.Server {
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, CORS);
        res.end();
        return;
      }
      const ruta = (req.url ?? '/').split('?')[0].replace(/\/+$/, '');
      const metodo = req.method ?? 'GET';

      if (ruta === '/mcp') {
        if (metodo !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json', Allow: 'POST', ...CORS });
          return void res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido (MCP sin estado: solo POST)' }, id: null }));
        }
        let cuerpo: unknown;
        try { cuerpo = JSON.parse(await leerCuerpo(req)); } catch { return enviar(res, 400, { error: 'JSON inválido' }); }
        return await manejarMcpHttp({ deps, store, desdeAgente: false }, req, res, cuerpo);
      }

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
        const evento = crearEvento(deps, store, v.brief);
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
          await ejecutarEvento(deps, store, evento, opciones.agente);
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
