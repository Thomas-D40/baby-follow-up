import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `new URL('./index.css', import.meta.url)` is rejected by readFileSync under jsdom (foreign URL
// class): go through the path string instead.
const css =readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'index.css'), 'utf8')

// jsdom does not load index.css, so a tint is only observable through the stylesheet text. These
// tests pin the CSS VARIABLES each selector uses (Épic 22, D22-K / D22-Q), not the layout of the
// file: grouping or reordering selectors must not break them, renaming one must.

const normalize = (text) => text.replace(/\s+/g, ' ').trim()

// Every `<selector list> { <declarations> }` block of the stylesheet, comments removed. The list is
// split on `,`: a selector matches a block when it EQUALS one entry of the list (never a substring).
const blocks = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
  selectors: m[1].split(',').map(normalize),
  body: normalize(m[2]),
}))

// Declarations of the single block that lists `selector`; fails loudly when there is none or several.
function ruleBody(selector) {
  const wanted = normalize(selector)
  const found = blocks.filter((b) => b.selectors.includes(wanted))
  if (found.length !== 1) {
    throw new Error(`Expected exactly one CSS block for "${selector}", found ${found.length}`)
  }
  return found[0].body
}

describe('barre d’actions à six boutons (Épic 22, D22-A / D22-J)', () => {
  it('la barre compte six colonnes explicites', () => {
    expect(ruleBody('.quick-bar')).toContain('repeat(6, 1fr)')
  })

  it('« Soins » a la teinte « soin »', () => {
    const body = ruleBody('.quick-btn--care')
    expect(body).toContain('var(--care-bg)')
    expect(body).toContain('var(--care-ink)')
  })

  it('« Médical » garde sa teinte « température »', () => {
    const body = ruleBody('.quick-btn--medical')
    expect(body).toContain('var(--temp-bg)')
    expect(body).toContain('var(--temp-ink)')
    expect(body).not.toContain('--care')
  })
})

describe('teinte du médicament dans le récap (D22-K)', () => {
  it.each(['.chip--medication', '.event-tag--medication'])(
    '%s prend la teinte « température » et plus la teinte « soin »',
    (selector) => {
      const body = ruleBody(selector)
      expect(body).toContain('var(--temp-bg)')
      expect(body).toContain('var(--temp-ink)')
      expect(body).not.toContain('--care')
    },
  )

  it.each(['.chip--temperature', '.event-tag--temperature'])(
    '%s garde la teinte « température » (le 💊 la partage)',
    (selector) => {
      const body = ruleBody(selector)
      expect(body).toContain('var(--temp-bg)')
      expect(body).toContain('var(--temp-ink)')
    },
  )

  it.each(['.chip--eye-care', '.chip--nose-care', '.event-tag--eye-care', '.event-tag--nose-care'])(
    '%s garde la teinte « soin »',
    (selector) => {
      const body = ruleBody(selector)
      expect(body).toContain('var(--care-bg)')
      expect(body).toContain('var(--care-ink)')
    },
  )
})

describe('pastille 💊 allumée / éteinte (D22-K)', () => {
  it('allumée : bordure « température », plus de bordure « soin »', () => {
    const body = ruleBody('.chip--toggle[aria-pressed="true"].chip--medication')
    expect(body).toContain('border-color: var(--temp)')
    expect(body).not.toContain('--care')
  })

  it('éteinte : état neutre commun à toutes les pastilles, inchangé', () => {
    const body = ruleBody('.chip--toggle[aria-pressed="false"]')
    expect(body).toContain('var(--surface-2)')
    expect(body).toContain('var(--text)')
    expect(body).toContain('var(--border)')
  })

  it('les pastilles 👁 et 👃 allumées gardent la bordure « soin »', () => {
    expect(ruleBody('.chip--toggle[aria-pressed="true"].chip--eye-care')).toContain('border-color: var(--care)')
    expect(ruleBody('.chip--toggle[aria-pressed="true"].chip--nose-care')).toContain('border-color: var(--care)')
  })

  it('la pastille 🌡 allumée garde la bordure « température »', () => {
    expect(ruleBody('.chip--toggle[aria-pressed="true"].chip--temperature')).toContain('border-color: var(--temp)')
  })
})

describe('section Médicament en teinte « température » (D22-K)', () => {
  it('l’option enfoncée utilise fond, encre et bordure « température »', () => {
    const body = ruleBody('.toggle-chip--temp-on')
    expect(body).toContain('var(--temp-bg)')
    expect(body).toContain('var(--temp-ink)')
    expect(body).toContain('var(--temp)')
    expect(body).not.toContain('--care')
  })

  it('les bascules « soin » (Yeux / Nez) gardent leur teinte', () => {
    const body = ruleBody('.toggle-chip--care-on')
    expect(body).toContain('var(--care-bg)')
    expect(body).toContain('var(--care-ink)')
    expect(body).toContain('var(--care)')
  })

  it('les boutons « Enregistrer » gardent leur teinte : rose pour Température et Médicament, mauve pour Soins', () => {
    expect(ruleBody('.btn--temp')).toContain('var(--temp)')
    expect(ruleBody('.btn--care')).toContain('var(--care)')
  })
})
