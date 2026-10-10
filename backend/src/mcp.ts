// Servidor MCP (SDK oficial) que expone las herramientas de src/herramientas.ts.
import type http from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Ctx, Herramienta } from './herramientas.ts';
import { HERRAMIENTAS, ErrorHerramienta, invocar } from './herramientas.ts';

export interface OpcionesMcp {
  // Evento fijo (agente propio): las herramientas no piden evento_id y no hay crear_evento.
  eventoFijo?: string;
  herramientas?: Herramienta[];
}

function definicion(h: Herramienta, fijo: boolean) {
  const conEvento = h.requiereEvento && !fijo;
  return {
    name: h.nombre,
    description: h.descripcion,
    inputSchema: {
      type: 'object' as const,
      properties: { ...(conEvento ? { evento_id: { type: 'string', description: 'ID del evento (lo devuelve crear_evento)' } } : {}), ...h.esquema.properties },
      required: [...(conEvento ? ['evento_id'] : []), ...h.esquema.required],
    },
  };
}

export function crearServidorMcp(ctx: Ctx, op: OpcionesMcp = {}): Server {
  const fijo = op.eventoFijo !== undefined;
  const lista = (op.herramientas ?? HERRAMIENTAS).filter((h) => !(fijo && !h.requiereEvento));
  const server = new Server({ name: 'quotelock', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: lista.map((h) => definicion(h, fijo)) }));
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const h = lista.find((x) => x.nombre === req.params.name);
    const salida = (obj: unknown, isError = false) => ({ content: [{ type: 'text' as const, text: JSON.stringify(obj) }], ...(isError ? { isError: true } : {}) });
    if (!h) return salida({ error: `Herramienta desconocida: ${req.params.name}` }, true);
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    try {
      let evento = null;
      if (h.requiereEvento) {
        const id = fijo ? op.eventoFijo : args.evento_id;
        evento = typeof id === 'string' ? (ctx.store.obtener(id) ?? null) : null;
        if (!evento) return salida({ error: 'Evento no encontrado; indica un evento_id válido (crear_evento)' }, true);
      }
      return salida(await invocar(ctx, h, evento, args));
    } catch (e) {
      // Nunca incluir secretos: solo mensajes propios.
      return salida({ error: e instanceof ErrorHerramienta ? e.message : 'Error interno de la herramienta' }, true);
    }
  });
  return server;
}

// Cliente MCP conectado en memoria a un servidor propio del evento: el agente pasa por MCP de verdad.
export async function crearClienteEnProceso(ctx: Ctx, op: OpcionesMcp): Promise<{ client: Client; cerrar: () => Promise<void> }> {
  const server = crearServidorMcp(ctx, op);
  const client = new Client({ name: 'quotelock-agente', version: '0.1.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return { client, cerrar: async () => { await client.close(); await server.close(); } };
}

// Streamable HTTP sin estado: un servidor + transporte por petición.
export async function manejarMcpHttp(ctx: Ctx, req: http.IncomingMessage, res: http.ServerResponse, cuerpo: unknown): Promise<void> {
  const server = crearServidorMcp(ctx);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, cuerpo);
}
