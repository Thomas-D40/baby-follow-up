import { describe, it, expect } from 'vitest'
import { CONSISTENCY_LABEL, toOccurredAtIso, toLocalInputValue } from './stool'

describe('CONSISTENCY_LABEL', () => {
  it('mappe les 3 consistances v1 (couleur hors périmètre, D5-F)', () => {
    expect(CONSISTENCY_LABEL).toEqual({ hard: 'Dure', soft: 'Molle', liquid: 'Liquide' })
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
