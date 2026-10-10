# QuoteLock backend (MVP B0-B4)

TypeScript directo en Node 24 (type stripping), sin dependencias de runtime. Datos en memoria.

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
`GET /api/eventos`, `POST /api/eventos`, `GET /api/eventos/:id`, `POST /api/eventos/:id/ejecutar` (contrato en `docs/05-tareas-mvp.md`). El brief acepta `notas` opcional: se guarda y nunca influye en reglas ni montos. Ejecutar un evento ya ejecutado no vuelve a cobrar.

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
- Las decisiones las toma un orquestador determinista; no hay LLM.

## Modo de pago (`MODO_PAGO`, con `REAP_API_KEY`)
- `aprobacion` (default): búsqueda y cotización reales; `POST /api/eventos/:id/ejecutar` crea un checkout real por partida (sin `X-Simulate-Checkout`) y no espera: evento y partidas quedan `por_aprobar` con `urlAprobacion`, `aprobacionExpira` (15 min) y `checkoutId`. Una persona aprueba en esa URL de Reap.
- `GET /api/eventos/:id` consulta en Reap los checkouts pendientes (máx. una ronda cada 2 s): `PROCESSING` -> partida `aprobado`, `COMPLETED` -> `pagado`, `FAILED`/`EXPIRED` -> `no_lograda`. Sin pendientes: `revision_humana` si alguna falló; si no, `ajustado` o `pagado`.
- `simulado`: cotización real, pago local (`orderId` `sim_...`), evento `pagado` con `modoSimulado: true`. El evento incluye `modoPago`.
