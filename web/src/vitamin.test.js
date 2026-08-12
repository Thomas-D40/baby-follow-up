import { describe, it, expect } from 'vitest'
import { vitaminLabel, vitaminItems, VITAMIN_LABEL } from './vitamin'

describe('vitamin — logique pure (Épic 9)', () => {
  it('mappe les types connus vers leur libellé FR', () => {
    expect(vitaminLabel('d')).toBe('Vitamine D')
    expect(vitaminLabel('k')).toBe('Vitamine K')
    expect(VITAMIN_LABEL).toEqual({ d: 'Vitamine D', k: 'Vitamine K' })
  })

  it('dégrade en douceur sur un type inconnu (repli sur le code brut)', () => {
    expect(vitaminLabel('zinc')).toBe('zinc')
  })

  it('extrait les items ; tolère un jour non chargé (tableau vide)', () => {
    const items = [{ vitaminType: 'd', given: true, authorId: 'u1' }]
    expect(vitaminItems({ date: '2026-08-12', items })).toBe(items)
    expect(vitaminItems(undefined)).toEqual([])
    expect(vitaminItems(null)).toEqual([])
  })
})
