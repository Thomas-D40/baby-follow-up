import { describe, it, expect } from 'vitest'
import { DISH_MAX_LENGTH, FIXED_DISHES, parseDishLabel } from './dish'

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
