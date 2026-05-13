import { test, expect } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const JWT = process.env.PLAYWRIGHT_JWT || '';

const GRID_URL = BASE_URL + '/devis/grid';

const CHAMPS = [
  { label: 'Désignation', selector: '[placeholder="désignation…"]', value: 'Test désignation' },
  { label: 'Localisation', selector: '[placeholder="localisation…"]', value: 'Test local' },
  { label: 'Type produit', selector: '[placeholder="type produit…"]', value: 'Test type' },
  { label: 'Gamme', selector: '[placeholder="gamme…"]', value: 'Test gamme' },
  { label: 'Vantail', selector: '[placeholder="vantail…"]', value: 'Test vantail' },
  { label: 'H (HT)', selector: '[placeholder="H (HT)…"]', value: '2100' },
  { label: 'L (HT)', selector: '[placeholder="L (HT)…"]', value: '900' },
  { label: 'PU HT', selector: '[placeholder="PU HT…"]', value: '123' },
  { label: 'Q.', selector: '[placeholder="Q.…"]', value: '2' },
];

test.describe('Ligne blanche - tous champs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL + '/login');
    await page.evaluate((token) => {
      localStorage.setItem('token', token);
    }, JWT);
    await page.goto(GRID_URL);
    await expect(page).toHaveURL(/.*\/devis\/grid/);
  });

  for (const champ of CHAMPS) {
    test(`Ajout/modif/undo/redo champ ${champ.label}`, async ({ page }) => {
      // Ajout ligne blanche
      await page.getByRole('button', { name: /ligne blanche/i }).first().click();
      // Saisie champ
      await page.fill(champ.selector, champ.value);
      // Validation (tab ou entrée)
      await page.keyboard.press('Tab');
      // Vérifier présence dans la grid
      await expect(page.locator('td')).toContainText(champ.value);
      // Vérifier historique
      await page.getByRole('button', { name: /historique/i }).click();
      await expect(page.locator('.history')).toContainText(champ.value);
      // Undo
      await page.getByRole('button', { name: /retour arrière/i }).click();
      await expect(page.locator('td')).not.toContainText(champ.value);
      // Redo
      await page.getByRole('button', { name: /rétablir/i }).click();
      await expect(page.locator('td')).toContainText(champ.value);
      // Vérifier qu’aucune ligne vide n’est présente
      const emptyRows = await page.locator('tr').filter({ hasText: /^\s*$/ }).count();
      expect(emptyRows).toBe(0);
    });
  }
});
