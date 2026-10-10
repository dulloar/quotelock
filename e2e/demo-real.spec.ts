import { test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';

const SCRATCH = '/private/tmp/claude-501/-Users-David/20f00b9f-07f7-49c2-92c2-d0bc2baa4e33/scratchpad';
const DRY = !!process.env.DRY;
const log = (...a: unknown[]) => console.log('[demo-real]', ...a);

async function rotulo(page: Page, texto: string, sub = '', tarjeta = false) {
  await page
    .evaluate(
      ([t, s, full]) => {
        let el = document.getElementById('ql-cap');
        if (!el) {
          el = document.createElement('div');
          el.id = 'ql-cap';
          document.documentElement.appendChild(el);
        }
        const base = 'position:fixed;left:0;right:0;z-index:2147483647;color:#fff;font:22px/1.35 system-ui,sans-serif;text-align:center;box-sizing:border-box;pointer-events:none;';
        el.setAttribute(
          'style',
          base +
            (full
              ? 'top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:24px;padding:60px;background:#111827;font-size:34px;'
              : 'bottom:0;padding:14px 40px;background:rgba(15,23,42,.88);'),
        );
        el.innerHTML = '';
        const a = document.createElement('div');
        a.textContent = t;
        a.style.fontWeight = '600';
        el.appendChild(a);
        if (s) {
          const b = document.createElement('div');
          b.textContent = s;
          b.style.cssText = 'font-size:20px;opacity:.9;';
          el.appendChild(b);
        }
      },
      [texto, sub, tarjeta] as const,
    )
    .catch((e) => log('rotulo falló', String(e)));
}
const quitar = (page: Page) => page.evaluate(() => document.getElementById('ql-cap')?.remove()).catch(() => {});
const suave = (page: Page, sel: string) =>
  page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), sel).catch(() => {});
const enlaces = (page: Page) => page.locator('a:has-text("Aprobar en Reap")');

async function esperar(page: Page, fn: () => Promise<boolean>, ms: number) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    try {
      if (await fn()) return true;
    } catch {
      /* sigue */
    }
    await page.waitForTimeout(1000);
  }
  return false;
}

test('demo QuoteLock en modo real (Reap sandbox)', async ({ page }) => {
  try {
    await page.goto('/#/nuevo');
    await rotulo(page, 'QuoteLock — el agente que gobierna el gasto de un evento', 'Demostración con la API real de Reap (sandbox)', true);
    await page.waitForTimeout(4000);
    await rotulo(page, 'El organizador da el brief: 10 asistentes, $5,000 MXN de presupuesto y 10% de margen');
    await page.fill('input[name="nombre"]', 'Workshop corporativo');
    await page.fill('input[name="fecha"]', '2026-10-24');
    await page.fill('input[name="asistentes"]', '10');
    await page.fill('input[name="presupuesto"]', '5000');
    await page.check('input[name="margen"][value="0.1"]');
    await page.waitForTimeout(3000);
    if (DRY) {
      log('DRY: formulario lleno, no se ejecuta');
      return;
    }

    await page.getByRole('button', { name: 'Ejecutar' }).first().click();
    await esperar(page, async () => /#\/eventos\//.test(page.url()), 90000);
    const eventoUrl = page.url();
    log('evento', eventoUrl);
    const hayAprobar = await esperar(page, async () => (await enlaces(page).count()) > 0, 90000);
    if (!hayAprobar) log('No aparecieron enlaces de aprobación; estado inesperado');
    await rotulo(page, 'El agente buscó y cotizó en comercios reales, validó cada cotización contra las reglas y creó los cargos en Reap');
    await page.waitForTimeout(2000);

    let n = 0;
    let reintentos = 0;
    for (let vuelta = 0; vuelta < 15; vuelta++) {
      const total = await enlaces(page).count().catch(() => 0);
      if (total === 0) {
        const reint = page.getByRole('button', { name: 'Recotizar y reintentar' });
        if (reintentos < 3 && (await reint.count().catch(() => 0)) > 0) {
          reintentos++;
          await rotulo(page, 'Un cargo no se logró: el agente recotiza y crea un cargo nuevo');
          await page.waitForTimeout(2500);
          await reint.first().click();
          await esperar(page, async () => (await enlaces(page).count()) > 0, 90000);
          continue;
        }
        break;
      }
      n++;
      const href = await enlaces(page).first().getAttribute('href');
      if (!href) {
        log('enlace sin href');
        break;
      }
      await rotulo(page, `Cargo ${n}: lo aprueba una persona en la página de Reap`);
      await page.waitForTimeout(2500);
      await quitar(page); // no se inyecta nada en la página de Reap
      await page.goto(href);
      const volvio = await page.waitForURL(/^https:\/\/example\.com/, { timeout: 4 * 60 * 1000 }).then(() => true, () => false);
      if (!volvio) log(`Cargo ${n}: no hubo redirección a example.com en 4 min`);
      await page.goto(eventoUrl);
      await rotulo(page, `Cargo ${n}: de vuelta en QuoteLock, esperando la confirmación de Reap`);
      const ok = await esperar(page, async () => (await enlaces(page).count()) < total, 40000);
      if (!ok) log(`Cargo ${n}: la partida sigue por aprobar tras 40 s`);
      await page.waitForTimeout(1500);
    }

    await page.evaluate(() => window.scrollTo({ top: 0 })).catch(() => {});
    const titular = ((await page.locator('#ev-titular').textContent({ timeout: 3000 }).catch(() => '')) ?? '').trim();
    const cifra = ((await page.locator('.ev-medida__cifra').first().textContent({ timeout: 3000 }).catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
    const estado = ((await page.locator('.ev-contexto dt:text-is("Estado") + dd').textContent({ timeout: 3000 }).catch(() => '')) ?? '').trim();
    await rotulo(page, `Resultado — ${estado}: ${titular}`, cifra);
    await page.waitForTimeout(4500);
    await rotulo(page, 'Libro de movimientos: presupuestado, cotizado y cobrado por partida, con la orden de Reap');
    await suave(page, '.ev-partida');
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(3000);
    await rotulo(page, 'Línea de tiempo: agente, reglas y persona');
    await page.locator('.ev-bitacora summary').first().click({ timeout: 3000 }).catch(() => {});
    await suave(page, '.ev-bloque--lado');
    await page.waitForTimeout(3000);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(3000);
    await rotulo(
      page,
      'Hoy Reap pide aprobar cada cargo porque los mandatos aún no existen. El agente deja cada cargo validado y a un clic; con mandatos, ese clic desaparece.',
      '',
      true,
    );
    await page.waitForTimeout(5000);
  } catch (e) {
    log('error inesperado, se cierra para guardar el video:', String(e));
  }
});

test.afterAll(async () => {
  if (DRY) return;
  try {
    const dir = 'test-results-real';
    const webms: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, f.name);
        if (f.isDirectory()) walk(p);
        else if (p.endsWith('.webm')) webms.push(p);
      }
    };
    if (existsSync(dir)) walk(dir);
    const webm = webms[0];
    if (!webm || !ffmpeg) return log('no se encontró el webm o ffmpeg');
    const mp4 = webm.replace(/\.webm$/, '.mp4');
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
    mkdirSync(SCRATCH, { recursive: true });
    copyFileSync(webm, join(SCRATCH, 'quotelock-demo-real.webm'));
    copyFileSync(mp4, join(SCRATCH, 'quotelock-demo-real.mp4'));
    log('copiado a', SCRATCH);
  } catch (e) {
    log('conversión falló', String(e));
  }
});
