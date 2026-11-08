import { describe, it, expect } from 'vitest'
import { tidyLabel } from './textLabel'

// The one tidy rule shared by dish, medication and dosage (Épic 19, D19-Q).
describe('tidyLabel — mise en forme partagée', () => {
  it('null et undefined donnent une chaîne vide', () => {
    expect(tidyLabel(null)).toBe('')
    expect(tidyLabel(undefined)).toBe('')
  })

  it('bords retirés, blancs répétés réduits à un espace', () => {
    expect(tidyLabel('  Gaviscon   nourrisson  ')).toBe('Gaviscon nourrisson')
    expect(tidyLabel('  2  ml')).toBe('2 ml')
    expect(tidyLabel('   ')).toBe('')
  })

  it('tabulations et retours à la ligne comptent comme des blancs', () => {
    expect(tidyLabel('a\tb\n c')).toBe('a b c')
  })

  it('casse et accents conservés', () => {
    expect(tidyLabel('  Célestène ')).toBe('Célestène')
  })
})
