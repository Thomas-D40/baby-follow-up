import { describe, it, expect } from 'vitest'
import { parseQuantity, toOccurredAtIso, toLocalInputValue } from './bottleFeeding'

describe('parseQuantity (miroir client des bornes D3-E)', () => {
  it('refuse une quantité vide', () => {
    expect(parseQuantity('').ok).toBe(false)
  })
  it('refuse zéro et négatif', () => {
    expect(parseQuantity('0').ok).toBe(false)
    expect(parseQuantity('-5').ok).toBe(false)
  })
  it('refuse un non-entier', () => {
    expect(parseQuantity('12.5').ok).toBe(false)
  })
  it('refuse au-delà de 2000', () => {
    expect(parseQuantity('2001').ok).toBe(false)
  })
  it('accepte un entier rogné dans les bornes', () => {
    expect(parseQuantity(' 120 ')).toEqual({ ok: true, value: 120 })
  })
})

describe('toOccurredAtIso', () => {
  it('convertit une valeur locale en ISO valide (round-trip)', () => {
    const iso = toOccurredAtIso('2026-06-21T10:30')
    expect(typeof iso).toBe('string')
    expect(new Date(iso).toISOString()).toBe(iso)
  })
  it('renvoie null sur date invalide', () => {
    expect(toOccurredAtIso('pas-une-date')).toBe(null)
  })
})

describe('toLocalInputValue', () => {
  it('formate en YYYY-MM-DDThh:mm (heure locale)', () => {
    const d = new Date(2026, 5, 21, 9, 5) // 21 juin 2026 09:05 local
    expect(toLocalInputValue(d)).toBe('2026-06-21T09:05')
  })
})
