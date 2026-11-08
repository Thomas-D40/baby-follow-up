import { describe, it, expect } from 'vitest'
import { DISH_MAX_LENGTH, FIXED_DISHES, isFixedDish, normalizeDishLabel, parseDishLabel } from './dish'

const EMPTY_ERROR = 'Indiquez le plat.'
const LONG_ERROR = 'Le plat ne doit pas dépasser 60 caractères.'

describe('constantes du référentiel (US18.3, D18-N)', () => {
  it('Purée et Compote sont les deux propositions fixes', () => {
    expect(FIXED_DISHES).toEqual(['Purée', 'Compote'])
  })

  it('le plat tient en 60 caractères au plus', () => {
    expect(DISH_MAX_LENGTH).toBe(60)
  })
})

describe('parseDishLabel — mise en forme et contrôle du plat (US18.3, D18-AD)', () => {
  it.each(['', '   ', ' \t '])('« %s » → « Indiquez le plat. »', (raw) => {
    expect(parseDishLabel(raw)).toEqual({ ok: false, error: EMPTY_ERROR })
  })

  it('61 caractères → « Le plat ne doit pas dépasser 60 caractères. »', () => {
    expect(parseDishLabel('x'.repeat(61))).toEqual({ ok: false, error: LONG_ERROR })
  })

  it('60 caractères sont acceptés', () => {
    expect(parseDishLabel('x'.repeat(60))).toEqual({ ok: true, value: 'x'.repeat(60) })
  })

  it('la longueur se mesure après mise en forme', () => {
    expect(parseDishLabel(`   ${'x'.repeat(60)}   `)).toEqual({ ok: true, value: 'x'.repeat(60) })
    expect(parseDishLabel(`${'x'.repeat(59)}     yy`).ok).toBe(false)
  })

  it('retire les espaces de bord et conserve casse et accents', () => {
    expect(parseDishLabel('  Compote pomme-poire  ')).toEqual({ ok: true, value: 'Compote pomme-poire' })
    expect(parseDishLabel('Purée de Carottes')).toEqual({ ok: true, value: 'Purée de Carottes' })
  })

  it('réduit les blancs répétés à un seul espace', () => {
    expect(parseDishLabel('  Compote   Pomme-poire ')).toEqual({ ok: true, value: 'Compote Pomme-poire' })
    expect(parseDishLabel('Purée\tde  carottes')).toEqual({ ok: true, value: 'Purée de carottes' })
  })
})

// Same cases as DishLabelsTest.Normalize on the server: the JS version is a mirror used for the
// display of the checkbox only, so any drift between the two must turn this suite red.
describe('normalizeDishLabel — miroir JS de DishLabels.normalize (US18.4, D18-AE)', () => {
  it.each([
    ['  Purée   de Carottes ', 'puree de carottes'],
    ['PURÉE', 'puree'],
    ['Crème brûlée', 'creme brulee'],
  ])('« %s » → « %s »', (raw, expected) => {
    expect(normalizeDishLabel(raw)).toBe(expected)
  })

  it('deux saisies qui ne diffèrent que par casse, accents ou espaces se normalisent pareil', () => {
    expect(normalizeDishLabel('Purée de carottes')).toBe(normalizeDishLabel('puree  DE   carottes'))
  })
})

describe('isFixedDish — Purée et Compote, quelle que soit la saisie (US18.4, D18-AF)', () => {
  it.each(['  PUREE ', 'compote', 'Purée', 'COMPOTE', ' purée '])('« %s » est fixe', (raw) => {
    expect(isFixedDish(raw)).toBe(true)
  })

  it.each(['Purée de carottes', 'Compote de pomme', 'Yaourt', ''])('« %s » n’est pas fixe', (raw) => {
    expect(isFixedDish(raw)).toBe(false)
  })
})
