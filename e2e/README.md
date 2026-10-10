# E2E demo QuoteLock

Prueba Playwright que graba un video de los tres casos (pagado, ajustado, revisión humana) en modo simulado.
Requiere `npm ci` en `web/` y Node 24 (el backend corre sin dependencias ni `.env`).
En esta carpeta: `npm i && npx playwright install chromium && npx playwright test`.
`webServer` arranca solo backend (3002) y web (5174) y los apaga al terminar.
El video queda en `test-results/**/video.webm` (ignorado por git).
