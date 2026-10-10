import { test, expect, type Page } from '@playwright/test';

const casos = [
  { nombre: 'Workshop demo 1 · cabe', pres: '30000', margen: '0.1', estado: 'Pagado', rotulo: 'Caso 1: el plan cabe en el presupuesto' },
  { nombre: 'Workshop demo 2 · margen', pres: '5500', margen: '0.3', estado: 'Ajustado dentro del margen', rotulo: 'Caso 2: rebasa el presupuesto pero cabe dentro del margen; el agente replanea solo' },
  { nombre: 'Workshop demo 3 · rebasa', pres: '5500', margen: '0.1', estado: 'Revisión humana', rotulo: 'Caso 3: rebasa el margen; el agente se detiene y no crea ningún cargo' },
];

// Franja o tarjeta; se vuelve a crear cada vez, así sobrevive a cualquier navegación.
async function rotulo(page: Page, texto: string, sub = '', tarjeta = false) {
  await page.evaluate(
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
        b.style.cssText = 'font-size:' + (full ? '24px' : '20px') + ';opacity:.9;';
        el.appendChild(b);
      }
    },
    [texto, sub, tarjeta] as const,
  );
}

const pausa = (page: Page, ms = 3500) => page.waitForTimeout(ms);
const suave = (page: Page, sel: string) =>
  page.evaluate((s) => document.querySelector(s)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), sel);

test('demo QuoteLock en modo simulado', async ({ page }) => {
  await page.goto('/#/');
  await rotulo(page, 'QuoteLock — el agente que gobierna el gasto de un evento', 'Demostración en MODO SIMULADO: el pago no pasa por Reap en este video', true);
  await pausa(page, 4500);
  await rotulo(page, 'Tus eventos');
  await page.evaluate(() => (document.getElementById('ql-cap')!.style.display = 'none'));
  await page.waitForTimeout(1500);

  for (const c of casos) {
    await page.goto('/#/nuevo');
    await rotulo(page, c.rotulo);
    await pausa(page, 4000);
    await page.fill('input[name="nombre"]', c.nombre);
    await page.fill('input[name="fecha"]', '2026-12-05');
    await page.fill('input[name="asistentes"]', '40');
    await page.fill('input[name="presupuesto"]', c.pres);
    await page.check(`input[name="margen"][value="${c.margen}"]`);
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Ejecutar' }).first().click();
    await expect(page).toHaveURL(/#\/eventos\//, { timeout: 30000 });
    await expect(page.getByText('MODO SIMULADO').first()).toBeVisible();
    await expect(page.locator('.ev-contexto dd', { hasText: c.estado }).first()).toBeVisible();

    // Resultado: cifras leídas de la pantalla.
    const titular = ((await page.locator('#ev-titular').textContent()) ?? '').trim();
    const cifra = ((await page.locator('.ev-medida__cifra').first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
    await rotulo(page, `Resultado — ${c.estado}: ${titular}`, cifra);
    await pausa(page, 4500);

    await rotulo(page, 'Libro de movimientos: presupuestado, cotizado y cobrado por partida');
    await suave(page, '.ev-partida');
    await pausa(page, 2500);
    await page.mouse.wheel(0, 350);
    await pausa(page, 2000);

    await rotulo(page, 'Línea de tiempo: qué hizo el agente, qué bloquearon las reglas y qué decidió la persona');
    await page.locator('.ev-bitacora summary').first().click();
    await suave(page, '.ev-bloque--lado');
    await pausa(page, 3000);
    await page.mouse.wheel(0, 400);
    await pausa(page, 2500);

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(1500);
    await page.getByRole('link', { name: 'Eventos' }).first().click();
    await expect(page.getByText(c.nombre)).toBeVisible();
    await rotulo(page, 'De vuelta a la lista de eventos');
    await pausa(page, 2500);
  }

  await rotulo(
    page,
    'Con la API real de Reap, cada cargo lo aprueba una persona en la página de Reap. Los mandatos de Reap aún no existen; hoy el límite de gasto es nuestro motor de reglas.',
    '',
    true,
  );
  await pausa(page, 5500);
});
