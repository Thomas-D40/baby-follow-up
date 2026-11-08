import { describe, it, expect } from 'vitest'
import { PASSWORD_MIN_LENGTH, validateNewPassword } from './password'

describe('validateNewPassword — règle du mot de passe d’un nouveau compte (Épic 17)', () => {
  const TWELVE = 'motdepasse12'
  const ELEVEN = 'motdepasse1'

  it('le minimum est de 12 caractères', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12)
  })

  it('11 caractères → message de longueur', () => {
    expect(validateNewPassword(ELEVEN, ELEVEN)).toBe('Le mot de passe doit comporter au moins 12 caractères.')
  })

  it('12 caractères identiques à la confirmation → valide (null)', () => {
    expect(validateNewPassword(TWELVE, TWELVE)).toBeNull()
  })

  it('12 caractères mais confirmation différente → message de correspondance', () => {
    expect(validateNewPassword(TWELVE, 'motdepasse13')).toBe('Les deux mots de passe ne correspondent pas.')
  })

  it('la longueur est contrôlée avant la correspondance', () => {
    expect(validateNewPassword(ELEVEN, 'autre')).toBe('Le mot de passe doit comporter au moins 12 caractères.')
  })

  it('champ vide → message de longueur', () => {
    expect(validateNewPassword('', '')).toBe('Le mot de passe doit comporter au moins 12 caractères.')
  })
})
