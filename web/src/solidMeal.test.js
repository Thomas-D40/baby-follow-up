import { describe, it, expect } from 'vitest'
import { PORTIONS, PORTION_LABEL, describeSolidMeal } from './solidMeal'

describe('PORTIONS / PORTION_LABEL (US18.3, D18-O)', () => {
  it('trois portions dans l’ordre Goûté, La moitié, Tout', () => {
    expect(PORTIONS).toEqual(['tasted', 'half', 'all'])
    expect(PORTION_LABEL).toEqual({ tasted: 'Goûté', half: 'La moitié', all: 'Tout' })
  })
})

describe('describeSolidMeal — détail d’une ligne du récap (US18.3, D18-V)', () => {
  it('plat et portion → « Purée de carottes · La moitié »', () => {
    expect(describeSolidMeal({ dish: 'Purée de carottes', portion: 'half' })).toBe('Purée de carottes · La moitié')
  })

  it('plat seul → « Purée de carottes »', () => {
    expect(describeSolidMeal({ dish: 'Purée de carottes', portion: null })).toBe('Purée de carottes')
  })

  it('chaque portion a son libellé', () => {
    expect(describeSolidMeal({ dish: 'Compote', portion: 'tasted' })).toBe('Compote · Goûté')
    expect(describeSolidMeal({ dish: 'Compote', portion: 'all' })).toBe('Compote · Tout')
  })
})
