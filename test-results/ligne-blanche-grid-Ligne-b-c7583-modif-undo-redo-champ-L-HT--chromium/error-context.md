# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ligne-blanche-grid.spec.ts >> Ligne blanche - tous champs >> Ajout/modif/undo/redo champ L (HT)
- Location: tests/ligne-blanche-grid.spec.ts:31:5

# Error details

```
Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/login
Call log:
  - navigating to "http://localhost:5173/login", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
  4  | const JWT = process.env.PLAYWRIGHT_JWT || '';
  5  | 
  6  | const GRID_URL = BASE_URL + '/devis/grid';
  7  | 
  8  | const CHAMPS = [
  9  |   { label: 'Désignation', selector: '[placeholder="désignation…"]', value: 'Test désignation' },
  10 |   { label: 'Localisation', selector: '[placeholder="localisation…"]', value: 'Test local' },
  11 |   { label: 'Type produit', selector: '[placeholder="type produit…"]', value: 'Test type' },
  12 |   { label: 'Gamme', selector: '[placeholder="gamme…"]', value: 'Test gamme' },
  13 |   { label: 'Vantail', selector: '[placeholder="vantail…"]', value: 'Test vantail' },
  14 |   { label: 'H (HT)', selector: '[placeholder="H (HT)…"]', value: '2100' },
  15 |   { label: 'L (HT)', selector: '[placeholder="L (HT)…"]', value: '900' },
  16 |   { label: 'PU HT', selector: '[placeholder="PU HT…"]', value: '123' },
  17 |   { label: 'Q.', selector: '[placeholder="Q.…"]', value: '2' },
  18 | ];
  19 | 
  20 | test.describe('Ligne blanche - tous champs', () => {
  21 |   test.beforeEach(async ({ page }) => {
> 22 |     await page.goto(BASE_URL + '/login');
     |                ^ Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5173/login
  23 |     await page.evaluate((token) => {
  24 |       localStorage.setItem('token', token);
  25 |     }, JWT);
  26 |     await page.goto(GRID_URL);
  27 |     await expect(page).toHaveURL(/.*\/devis\/grid/);
  28 |   });
  29 | 
  30 |   for (const champ of CHAMPS) {
  31 |     test(`Ajout/modif/undo/redo champ ${champ.label}`, async ({ page }) => {
  32 |       // Ajout ligne blanche
  33 |       await page.getByRole('button', { name: /ligne blanche/i }).first().click();
  34 |       // Saisie champ
  35 |       await page.fill(champ.selector, champ.value);
  36 |       // Validation (tab ou entrée)
  37 |       await page.keyboard.press('Tab');
  38 |       // Vérifier présence dans la grid
  39 |       await expect(page.locator('td')).toContainText(champ.value);
  40 |       // Vérifier historique
  41 |       await page.getByRole('button', { name: /historique/i }).click();
  42 |       await expect(page.locator('.history')).toContainText(champ.value);
  43 |       // Undo
  44 |       await page.getByRole('button', { name: /retour arrière/i }).click();
  45 |       await expect(page.locator('td')).not.toContainText(champ.value);
  46 |       // Redo
  47 |       await page.getByRole('button', { name: /rétablir/i }).click();
  48 |       await expect(page.locator('td')).toContainText(champ.value);
  49 |       // Vérifier qu’aucune ligne vide n’est présente
  50 |       const emptyRows = await page.locator('tr').filter({ hasText: /^\s*$/ }).count();
  51 |       expect(emptyRows).toBe(0);
  52 |     });
  53 |   }
  54 | });
  55 | 
```