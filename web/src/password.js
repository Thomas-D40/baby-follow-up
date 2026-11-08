// Pure model of the new-password rule. The back (PasswordUtil.meetsPolicy) stays the source of truth.

export const PASSWORD_MIN_LENGTH = 12

// Returns the message to show, or null when the password and its confirmation are acceptable.
export function validateNewPassword(password, confirm) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Le mot de passe doit comporter au moins ${PASSWORD_MIN_LENGTH} caractères.`
  }
  if (password !== confirm) return 'Les deux mots de passe ne correspondent pas.'
  return null
}
