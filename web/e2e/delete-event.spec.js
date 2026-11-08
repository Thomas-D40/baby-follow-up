import { test, expect } from '@playwright/test'

// Nominal end-to-end deletion flow (Épic 7, US7.1) : login → enregistre un biberon → le supprime
// avec confirmation depuis le calendrier → il disparaît. (La suppression depuis la fiche bébé a disparu
// avec la liste de la feuille, Épic 18 D18-J.)
// Requires a live stack with a seeded, activated parent + a selected baby. Credentials come from the
// env so the spec stays secret-free (run: E2E_EMAIL=… E2E_PASSWORD=… npm run e2e).
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

test.skip(!EMAIL || !PASSWORD, 'E2E_EMAIL / E2E_PASSWORD required (live stack)')

async function login(page) {
  await page.goto('/')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Mot de passe').fill(PASSWORD)
  await page.getByRole('button', { name: 'Se connecter' }).click()
  // S'assure qu'un bébé est sélectionné (fiche affichée) : crée-en un au besoin.
  if (!(await page.getByRole('heading', { level: 2 }).first().isVisible().catch(() => false))) {
    await page.getByRole('button', { name: /Ajouter un bébé|Ajouter un autre bébé/ }).first().click()
    await page.getByLabel('Prénom').fill(`E2E-${Date.now()}`)
    await page.getByRole('button', { name: 'Ajouter' }).click()
  }
}

// Saisie d'un biberon : la barre d'actions ouvre la feuille « Repas » (mode Biberon par défaut), on y
// saisit la quantité. Le bouton est cherché dans le groupe « Actions rapides » : la pastille « Biberon »
// du récap porte aussi ce nom.
async function addBottle(page, ml) {
  await page.getByRole('group', { name: 'Actions rapides' }).getByRole('button', { name: 'Repas' }).click()
  await page.getByLabel(/Quantité/i).fill(String(ml))
  await page.getByRole('button', { name: /Enregistrer/i }).click()
}

test('supprime un événement depuis le calendrier (modale)', async ({ page }) => {
  await login(page)

  const ml = 149
  await addBottle(page, ml)
  await page.getByRole('button', { name: 'Fermer' }).click() // referme la feuille → récap visible

  // Le récap du jour (calendrier) liste l'événement ; supprime-le via la modale.
  const calRow = page.getByRole('listitem').filter({ hasText: `${ml} ml` }).filter({ hasText: 'Biberon' }).first()
  await expect(calRow).toBeVisible()
  await calRow.getByRole('button', { name: /Supprimer biberon/ }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Oui, supprimer' }).click()

  await expect(page.getByText(`${ml} ml`)).toHaveCount(0)
})
