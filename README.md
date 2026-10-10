# QuoteLock

Agente que **gobierna el gasto de un evento**: planea el presupuesto, cotiza, se frena cuando algo no cabe, paga con Reap y concilia cada peso.

Proyecto del equipo **teamblue** para el Agentic Hackathon de Reap × AI Builders México. Track: **Most Worthwhile Problem**.

> Estado: repositorio inicial. Todavía no hay código; este README describe el propósito y la arquitectura propuesta. Lo marcado como **[Propuesta]** está por decidirse en equipo.

## El problema

Un organizador de eventos corporativos hace a mano decenas de compras pequeñas por evento: cotiza, paga con la tarjeta compartida, persigue comprobantes y concilia al final. El sobregasto se descubre cuando el evento ya pasó.

## Qué hace QuoteLock

1. Recibe un **brief**: fecha, asistentes, presupuesto y **margen** (excedente permitido: 10%, 20% o 30%).
2. Arma el presupuesto por partidas y el costo por asistente.
3. Busca y cotiza en los comercios soportados por Reap.
4. Valida cada cotización con un **motor de reglas determinista**, fuera del LLM.
5. Paga con el Agentic module de Reap, sin interrupciones.
6. Si algo no cabe, replanea solo dentro del margen. Si rebasa el margen, se detiene y pide revisión humana.
7. Concilia cada cargo: presupuestado, cotizado, cobrado y recibido.

**Tesis:** el agente no compra, gobierna el dinero del evento.

## Los tres casos de la demo [Propuesta]

| Caso | Qué pasa | Quién decide |
|---|---|---|
| 1. Cabe en el presupuesto | El agente cotiza y paga | El agente |
| 2. Rebasa una partida, pero cabe dentro del margen | El agente recotiza, cambia de comercio o mueve monto, y lo registra | El agente |
| 3. Ningún ajuste cabe dentro del margen | El agente se detiene | Revisión humana |

El mismo brief se puede correr con margen de 10%, 20% y 30% para mostrar en qué punto se detiene el agente.

## Arquitectura [Propuesta]

Todo corre **local**, en la laptop del equipo. No hay agentes en la nube ni servidor propio.

```
web (gestión de eventos)
  │  HTTP
  ▼
backend
  ├─ núcleo: herramientas del agente
  │    planear_presupuesto · buscar_producto · cotizar · elegir_envio
  │    pagar (llama primero al motor de reglas) · consultar_pago · conciliar
  ├─ motor de reglas (código determinista)
  │    techo = presupuesto × (1 + margen) · comercio permitido y con envío a MX
  │    cotización vigente · todo en MXN · sin cobro doble
  ├─ cliente Reap (la API key vive solo en .env)
  └─ SQLite: eventos, partidas, cotizaciones, cargos, incidencias
```

### Cómo corre el agente sin nube

Las herramientas se escriben una sola vez y se exponen de dos formas:

- **A. Servidor MCP local.** Cualquier cliente MCP (Claude Code o Claude Desktop) se conecta por stdio y actúa como el agente. No requiere escribir el ciclo del agente ni una API key de Anthropic. Sirve desde el primer día para probar contra el sandbox.
- **B. Agente propio en el backend.** El backend corre el ciclo del agente con el SDK oficial de Anthropic (`@anthropic-ai/sdk`, Tool Runner, modelo `claude-opus-5-5`) y la web lo dispara con un botón. Requiere una API key de Anthropic. Es lo que necesita la web para funcionar sola.

Orden propuesto: primero A, para validar las herramientas y las reglas; después B, para la demo en la web. En ambos casos la inferencia del modelo ocurre en la API de Anthropic; lo local es el agente, las herramientas, las reglas y los datos.

### Componentes

| Carpeta (por crear) | Qué es |
|---|---|
| `backend/` | Núcleo, motor de reglas, cliente Reap, SQLite, servidor MCP y API HTTP |
| `web/` | Lista de eventos y pantalla del evento: brief, línea de tiempo del agente y libro de movimientos |
| `docs/` | Plan, reglas, integración técnica y alineación con el hackathon |

Lenguaje propuesto: **TypeScript** en todo (Node 24). La laptop tiene Python 3.9 y el SDK de MCP para Python pide 3.10 o más.

### Alcance de la web

La web es **gestión de eventos**, pero el pago tiene que ser el centro (criterio del hackathon). Por eso la pantalla principal de cada evento es el **libro de movimientos** con la línea de tiempo del agente, no el plan del evento ni un chat. La lista de eventos es solo la entrada.

## Real y simulado

| Real (sandbox de Reap) | Simulado |
|---|---|
| Enrollment con tarjeta de prueba | La aprobación del checkout (header oficial `X-Simulate-Checkout`) |
| Búsqueda, cotización con envío e impuestos, checkout | Los tiempos de entrega por comercio |
| `orderId` y `finalAmount` | La recepción en sitio y el brief del evento |
| Motor de reglas y conciliación (código propio) | El tipo de cambio, si se usa uno fijo |

Los mandatos de Reap no existen todavía. Hoy el único límite de gasto es el motor de reglas.

## Reglas del hackathon que el código debe cumplir

- Todo pago pasa por el Agentic module de Reap. Nada de scraping ni de "cart permalinks".
- Solo comercios de la lista soportada y solo sandbox.
- El LLM nunca ve datos de tarjeta ni la API key.
- Sin viajes, alcohol ni categorías restringidas.

## Configuración

```bash
cp .env.example .env   # y llenar REAP_API_KEY
```

`.env` está en `.gitignore`. La key nunca va en el repo, en prompts, en logs ni en el video.

## Documentos

- [`docs/01-idea-y-plan.md`](docs/01-idea-y-plan.md): problema, idea, flujo y pasos.
- [`docs/02-reglas-integracion-roles.md`](docs/02-reglas-integracion-roles.md): checklist oficial, arquitectura y reparto.
- [`docs/03-integracion-tecnica-reap.md`](docs/03-integracion-tecnica-reap.md): endpoints, estados, errores y pruebas.
- [`docs/04-alineacion-reglas-quotelock.md`](docs/04-alineacion-reglas-quotelock.md): reglas del hackathon y prompt de auditoría.
- [`docs/05-tareas-mvp.md`](docs/05-tareas-mvp.md): **estrategia, contrato y tareas del MVP por persona.**

## Siguiente paso

Una compra completa a mano en el sandbox (doc 03, sección 9). Si eso falla, nada más importa.
