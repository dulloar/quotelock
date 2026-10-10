import { test, expect } from '@playwright/test';

const casos = [
  { nombre: 'Workshop demo 1 · cabe', pres: '30000', margen: '0.1', estado: 'Pagado' },
  { nombre: 'Workshop demo 2 · margen', pres: '5500', margen: '0.3', estado: 'Ajustado dentro del margen' },
  { nombre: 'Workshop demo 3 · rebasa', pres: '5500', margen: '0.1', estado: 'Revisión humana' },
];

test('demo QuoteLock en modo simulado', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForTimeout(2000);
  for (const c of casos) {
    await page.goto('/#/nuevo');
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
    await page.waitForTimeout(2000);
    for (const sel of ['.ev-partida', '.ev-bloque--lado', '.ev-contexto']) {
      await page.locator(sel).first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(2000);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(1500);
    await page.getByRole('link', { name: 'Eventos' }).first().click();
    await expect(page.getByText(c.nombre)).toBeVisible();
    await page.waitForTimeout(2000);
  }
});
