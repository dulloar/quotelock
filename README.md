# QuoteLock

Agente que **gobierna el gasto de un evento**: planea las compras, cotiza en comercios reales, se frena cuando algo no cabe, crea los cargos en Reap y concilia cada peso.

Proyecto del equipo **teamblue** para el Agentic Hackathon de Reap × AI Builders México. Track: **Most Worthwhile Problem**.

## El problema

Un organizador de eventos corporativos hace a mano decenas de compras pequeñas por evento: cotiza, paga con la tarjeta compartida, persigue comprobantes y concilia al final. El sobregasto se descubre cuando el evento ya pasó.

## Qué hace

1. Recibe un **brief**: fecha, asistentes, presupuesto y **margen** (excedente permitido: 10%, 20% o 30%).
2. Un **agente con modelo de lenguaje** decide qué comprar, en qué comercio y cuántas unidades, llamando herramientas por **MCP**.
3. Busca y cotiza productos reales con el Agentic module de Reap.
4. Cada cotización pasa por un **motor de reglas determinista**, fuera del modelo.
5. Si no hay existencias o algo se pasa, el agente ajusta la cantidad, cambia de producto o sigue sin esa partida, y lo registra.
6. Crea los cargos en Reap. Una persona aprueba cada cargo en la página de Reap.
7. Si un cargo falla o su cotización vence, recotiza y crea un cargo nuevo.
8. Lleva un libro de movimientos (presupuestado, cotizado, cobrado) y una línea de tiempo de quién hizo qué: agente, reglas o persona.

**Tesis:** el agente no compra, gobierna el dinero del evento.

## Sobre los mandatos de Reap

Los **mandatos** de Reap (un permiso previo del dueño de la tarjeta, con topes y vigencia, para que el agente cobre sin aprobación por cargo) **todavía no están disponibles**, ni en sandbox ni en producción. Nos habrían ayudado mucho, y este proyecto es justo el caso para el que existen:

- **Autonomía completa.** Hoy cada cargo necesita que una persona lo apruebe en la página de Reap. Con un mandato, el organizador autorizaría una sola vez "hasta el techo del evento, en estos comercios, hasta esta fecha" y el agente pagaría todo sin interrupciones.
- **El límite lo impondría la red de pagos.** Hoy el único freno al gasto es nuestro motor de reglas. Con mandatos, el techo (presupuesto × (1 + margen)) viajaría dentro del mandato y Reap rechazaría cualquier cargo fuera de él, falle o no nuestro código.
- **Sin cotizaciones vencidas por espera.** Las cotizaciones duran unos 5 minutos. Si la persona tarda en aprobar, el cargo falla y hay que recotizar. Con mandatos, el cargo saldría en el momento de cotizar.
- **Demostración y pruebas automáticas de punta a punta.** La aprobación manual impide grabar o probar el flujo real sin una persona presente.

El diseño ya está preparado para ellos: el motor de reglas calcula exactamente los valores que definirían el mandato (techo, comercios permitidos y vigencia). Cuando Reap los libere, la aprobación por cargo desaparece y el resto queda igual.

## Los tres casos

| Caso | Qué pasa | Quién decide |
|---|---|---|
| 1. Cabe en el presupuesto | El agente cotiza y crea los cargos | El agente |
| 2. Rebasa el presupuesto, pero cabe dentro del margen | El agente ajusta y lo registra | El agente |
| 3. Rebasa el techo aun con ajustes | No se crea ningún cargo | Revisión humana |

## Arquitectura

Todo corre **local**. No hay servidor propio en la nube; el modelo se consulta por API.

```
web (React + Vite)                       clientes MCP externos
  │  HTTP                                (Claude Code, Claude Desktop)
  ▼                                            │  /mcp
backend (Node 24, TypeScript) ◄────────────────┘
  ├─ agente LLM (DeepSeek) ── cliente MCP ──► servidor MCP
  │                                            herramientas: crear_evento · ver_evento ·
  │                                            listar_comercios · buscar_productos ·
  │                                            cotizar_partida · quitar_partida ·
  │                                            crear_cargos · pedir_revision_humana
  ├─ motor de reglas (código determinista; el modelo no puede saltárselo)
  │    techo = presupuesto × (1 + margen) · comercio permitido con envío a MX
  │    cotización vigente · sin cobro doble · sin alcohol ni viajes
  ├─ cliente Reap (search → quotes → checkouts; reintentos ante fallos pasajeros)
  └─ datos en memoria
```

- **El modelo decide; las reglas frenan.** `crear_cargos` valida el plan completo antes de crear un solo cargo. Hay pruebas con un modelo malicioso y con un brief con instrucciones maliciosas: ninguno logra un cargo fuera de regla.
- **Límites duros en código:** máximo 6 partidas y 25 llamadas a herramientas por evento.
- **Respaldo:** si el modelo no responde, se usa un plan determinista y queda registrado en la línea de tiempo.
- **Secretos:** las llaves viven solo en `.env`. El modelo nunca ve la llave de Reap ni datos de tarjeta; la tarjeta la captura una persona en la página de Reap.

| Carpeta | Qué es |
|---|---|
| `backend/` | Agente, servidor MCP, motor de reglas, cliente Reap y API HTTP. Ver [`backend/README.md`](backend/README.md) |
| `web/` | Lista de eventos, formulario del brief y pantalla del evento con libro de movimientos y línea de tiempo |
| `e2e/` | Prueba de punta a punta con Playwright que graba el video de demostración en modo simulado |
| `docs/` | Plan, reglas, integración técnica y tareas |

## Real y simulado

| Real (sandbox de Reap) | Simulado |
|---|---|
| Registro de la tarjeta (enrollment) | El brief del evento |
| Búsqueda de productos y cotización con envío e impuestos | La recepción en sitio |
| Creación de cargos y aprobación por una persona | El tipo de cambio, fijo, para comercios en otra moneda |
| Referencia de orden y monto cobrado | Un modo de pago simulado (`MODO_PAGO=simulado`), etiquetado en pantalla |
| Decisiones del agente (modelo real) y motor de reglas (código propio) | |

En el sandbox, un cargo aprobado queda "en proceso": no hay un comercio real que surta la orden. El video de `e2e/` corre en modo simulado y lo dice en pantalla.

## Límites conocidos

- Los datos viven en memoria: reiniciar el backend borra los eventos.
- El sandbox tiene poco inventario, así que el agente a veces arma planes con lo que hay y no con lo ideal.
- Solo cuatro comercios están verificados en el sandbox: Blend Station, Stationery Pal, Acteck y BalamRush.
- Cubre los **insumos** de un evento, no recinto, audio ni catering.

## Cómo correrlo

```bash
cp .env.example .env                      # llenar REAP_API_KEY, REAP_ENROLLMENT_ID, REAP_EMAIL y DEEPSEEK_API_KEY
git config core.hooksPath .githooks       # bloquea commits con llaves o archivos .env

cd backend && npm install && npm start    # http://localhost:3001
cd web && npm ci && npm run dev           # http://localhost:5173
```

Sin `REAP_API_KEY` todo corre en modo simulado. Sin `DEEPSEEK_API_KEY` (o con `MODO_AGENTE=reglas`) decide el plan determinista.

Para usar las herramientas desde Claude Code:

```bash
claude mcp add --transport http quotelock http://localhost:3001/mcp
```

Pruebas: `cd backend && npm test` (63 pruebas) y `cd e2e && npm install && npx playwright test`.

## Reglas del hackathon que el código cumple

- Todo pago pasa por el Agentic module de Reap. Nada de scraping ni de "cart permalinks".
- Solo comercios de la lista soportada y solo sandbox.
- El modelo nunca ve datos de tarjeta ni la llave de Reap.
- Sin viajes, alcohol ni categorías restringidas.

## Documentos

- [`docs/01-idea-y-plan.md`](docs/01-idea-y-plan.md): problema, idea, flujo y pasos.
- [`docs/02-reglas-integracion-roles.md`](docs/02-reglas-integracion-roles.md): checklist oficial, arquitectura y reparto.
- [`docs/03-integracion-tecnica-reap.md`](docs/03-integracion-tecnica-reap.md): endpoints, estados, errores y pruebas.
- [`docs/04-alineacion-reglas-quotelock.md`](docs/04-alineacion-reglas-quotelock.md): reglas del hackathon y prompt de auditoría.
- [`docs/05-tareas-mvp.md`](docs/05-tareas-mvp.md): estrategia, contrato y tareas del MVP por persona.

Los documentos 01 a 04 son el plan original; donde difieran de este README, manda el README.
