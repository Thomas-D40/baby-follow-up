import { describe, it, expect } from 'vitest'
import { reconcileSelection } from './useBabies'

// D2-C: the pure reconciliation core, the logic most prone to silent bugs (orphan selection).
describe('reconcileSelection', () => {
  const a = { id: 'a', firstName: 'Léa' }
  const b = { id: 'b', firstName: 'Tom' }

  it('sélectionne implicitement le bébé unique (pas de sélecteur)', () => {
    expect(reconcileSelection([a], null)).toBe('a')
    expect(reconcileSelection([a], 'stale')).toBe('a') // un seul bébé prime sur la valeur stockée
  })

  it('conserve une sélection encore présente dans la liste', () => {
    expect(reconcileSelection([a, b], 'b')).toBe('b')
  })

  it('réinitialise une sélection orpheline (bébé délié/supprimé)', () => {
    expect(reconcileSelection([a, b], 'ghost')).toBe(null)
  })

  it('renvoie null si aucun bébé', () => {
    expect(reconcileSelection([], 'x')).toBe(null)
  })

  it('renvoie null si plusieurs bébés et aucune sélection', () => {
    expect(reconcileSelection([a, b], null)).toBe(null)
  })
})
