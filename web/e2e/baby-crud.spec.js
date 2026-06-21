import { test, expect } from '@playwright/test'

// Nominal end-to-end flow (D2-A): login → create a baby → implicit selection → it is displayed.
// Requires a live stack with a seeded, activated parent. Credentials come from the env so the
// spec stays secret-free (run: E2E_EMAIL=… E2E_PASSWORD=… npm run e2e).
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL / E2E_PASSWORD required (live stack)')

test('un parent crée un bébé et le voit sélectionné', async ({ page }) => {
  await page.goto('/')

  // Login (US1.3)
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()

  // Create a baby (US2.1)
  const name = `E2E-${Date.now()}`
  await page.getByRole('button', { name: /Ajouter un bébé|Ajouter un autre bébé/ }).first().click()
  await page.getByLabel('Prénom').fill(name)
  await page.getByRole('button', { name: 'Ajouter' }).click()

  // It is created, selected and displayed (US2.2 implicit selection if single)
  await expect(page.getByText('Bébé ajouté.')).toBeVisible()
  await expect(page.getByRole('heading', { name, level: 2 })).toBeVisible()
})
