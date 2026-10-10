# QuoteLock backend (MVP B0-B4)

TypeScript directo en Node 24 (type stripping); única dependencia de runtime: `@modelcontextprotocol/sdk`. Datos en memoria.

## Correr y probar
```bash
cd backend
npm install
npm start          # http://localhost:3001 (PORT opcional); lee ../.env si existe
npm test           # node:test
npm run typecheck  # tsc --noEmit
```
Variables: `PORT`, `REAP_API_KEY` (vacía = modo simulado), `REAP_BASE_URL`, `REAP_VERSION`, `REAP_RETURN_URL`, `REAP_ENROLLMENT_ID`, `REAP_EMAIL`, `FX_USD_MXN` (default 18.5), `MODO_PAGO` (`aprobacion` por defecto con `REAP_API_KEY`, o `simulado`).

## Rutas
`GET /api/eventos`, `POST /api/eventos`, `GET /api/eventos/:id`, `POST /api/eventos/:id/ejecutar` (contrato en `docs/05-tareas-mvp.md`). El brief acepta `notas` opcional: se guarda y nunca influye en reglas ni montos. Ejecutar un evento ya ejecutado no vuelve a cobrar. `POST /api/eventos/:id/reintentar` (sin body) recotiza y crea cargo nuevo para las partidas `no_lograda`/`bloqueado` de un evento en `revision_humana` (409 si no hay nada que reintentar; respeta techo y no cobro doble).

## Tres briefs (40 asistentes, mismo evento)
Con el catálogo simulado y FX 18.5, el plan preferido cotiza 21,534.95 MXN y el plan con las alternativas más baratas 6,718.90 MXN.

| Caso | presupuestoMXN | margen | techo | estado |
|---|---|---|---|---|
| 1. Cabe | 30000 | 0.1 | 33000 | `pagado` |
| 2. Cabe con margen | 5500 | 0.3 | 7150 | `ajustado` (replaneación; total 6,718.90 > presupuesto) |
| 3. Rebasa el margen | 5500 | 0.1 | 6050 | `revision_humana` (0 checkouts) |

```bash
curl -s -XPOST localhost:3001/api/eventos -H 'Content-Type: application/json' \
  -d '{"nombre":"Workshop","fecha":"2026-10-24","asistentes":40,"presupuestoMXN":5500,"margen":0.3}'
curl -s -XPOST localhost:3001/api/eventos/evt_1/ejecutar
```
`costoPorAsistenteMXN` = cobrado / asistentes (si no hay cobro, lo cotizado / asistentes).

## Qué es simulado
- Sin `REAP_API_KEY`, el cliente de Reap es simulado (catálogo fijo, envío por comercio, checkout `COMPLETED` inmediato); el evento expone `modoSimulado: true`.
- El tipo de cambio USD->MXN es fijo (`FX_USD_MXN`) y se guarda por partida en `tipoCambio`.
- El cliente REAL (`src/reap.ts`, `ReapReal`) está implementado según docs/03 pero **NO se ha probado contra el sandbox** (no hay API key). Ajustar formas de respuesta al primer uso real.
- Sin `DEEPSEEK_API_KEY` (o con `MODO_AGENTE=reglas`) las decisiones las toma el orquestador determinista; ver «Agente LLM y MCP».

## Modo de pago (`MODO_PAGO`, con `REAP_API_KEY`)
- `aprobacion` (default): búsqueda y cotización reales; `POST /api/eventos/:id/ejecutar` crea un checkout real por partida (sin `X-Simulate-Checkout`) y no espera: evento y partidas quedan `por_aprobar` con `urlAprobacion`, `aprobacionExpira` (15 min) y `checkoutId`. Una persona aprueba en esa URL de Reap.
- `GET /api/eventos/:id` consulta en Reap los checkouts pendientes (máx. una ronda cada 2 s): `PROCESSING` -> partida `aprobado`, `COMPLETED` -> `pagado`, `FAILED`/`EXPIRED` -> `no_lograda`. Sin pendientes: `revision_humana` si alguna falló; si no, `ajustado` o `pagado`.
- `simulado`: cotización real, pago local (`orderId` `sim_...`), evento `pagado` con `modoSimulado: true`. El evento incluye `modoPago`.

## Robustez
- `ReapReal` reintenta búsqueda y cotización ante 503/429/red (1 s, 2 s, 4 s; respeta `Retry-After`, tope 5 s) con la misma Idempotency-Key; los checkouts no se reintentan.
- Si faltan existencias (`VARIANT_UNAVAILABLE`, `QUOTE_UNFULFILLABLE`, `AGENTIC_REQUEST_REJECTED`) la cantidad se reduce a la mitad hasta 4 veces; el timeline lo registra.
- Una partida sin cotización queda `no_lograda` y el evento sigue (termina `ajustado`); solo va a `revision_humana` si rebasa el techo, falla un cargo o nada cotiza.

## Agente LLM y MCP
Con `DEEPSEEK_API_KEY` (y `MODO_AGENTE` distinto de `reglas`), `POST /api/eventos/:id/ejecutar` deja que un LLM (DeepSeek, `deepseek-chat`, modelo configurable con `DEEPSEEK_MODEL`) decida qué comprar llamando herramientas por MCP. El evento expone `agente` (`llm` | `determinista`) y `modeloAgente`. Si el LLM falla (red, 4xx/5xx) el timeline lo registra (actor `reglas`) y se usa el plan determinista de siempre. `refrescar` y `reintentar` funcionan igual (el reintento recotiza la misma variante y cantidad).

El agente propio usa un cliente MCP en memoria (`InMemoryTransport`) contra un servidor MCP con las mismas herramientas; descubre las definiciones con `listTools()` y las invoca con `callTool()`. El mismo servidor está en HTTP (Streamable HTTP sin estado) en `POST /mcp`, sobre los mismos eventos que ve la web:
```bash
claude mcp add --transport http quotelock http://localhost:3001/mcp
```
Herramientas (una sola definición en `src/herramientas.ts`; por HTTP todas reciben `evento_id`): `crear_evento` (solo HTTP), `ver_evento`, `listar_comercios`, `buscar_productos`, `cotizar_partida`, `quitar_partida`, `crear_cargos`, `pedir_revision_humana`.

Qué frena el motor de reglas (el LLM no puede saltarlo): `crear_cargos` valida el plan completo antes de crear un solo checkout (techo = presupuesto x (1 + margen) sobre la suma de TODAS las partidas, comercio permitido y envío a MX, categorías prohibidas, vigencia de la cotización, no cobro doble) y luego cada cargo pasa por `pagar`, la única vía a checkouts. Si algo falla no se crea nada y se registra una entrada `reglas`. Límites duros en código: máx. 6 partidas, 25 llamadas a herramientas por evento (la 26 deja el evento en `revision_humana`), 150 s por ejecución, cantidades enteras 1-200 y un solo `crear_cargos` exitoso por evento. Las `notas` del brief llegan al LLM como dato no confiable y nunca cambian presupuesto, margen ni reglas. Si el LLM termina sin `crear_cargos` ni `pedir_revision_humana`, el evento queda `revision_humana` («El agente no cerró el plan»). En modo aprobación las partidas quedan `por_aprobar`.
