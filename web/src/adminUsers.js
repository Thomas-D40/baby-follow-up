// Pure model of the administrator's account list (Épic 20).

export const ACCOUNT_ROLE_LABEL = { admin: 'Admin', parent: 'Parent' }

export const ACCOUNT_STATUS_LABEL = { active: 'Actif', pending: "En attente d'activation" }

const PARIS_DATE = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris',
})

// "08/11/2026", in Europe/Paris: an account created at 23:30 UTC shows the Paris date of the next day.
export function formatAccountDate(iso) {
  return PARIS_DATE.format(new Date(iso))
}

// Texts of the account removal (Épic 24). `mode` is 'delete' (an active account) or 'revoke' (a pending
// one, whose invitation is withdrawn).
export const ACCOUNT_REMOVAL_LABELS = {
  delete: { trigger: 'Supprimer', confirm: 'Oui, supprimer', failure: 'Échec de la suppression. Réessayez.' },
  revoke: { trigger: "Révoquer l'invitation", confirm: 'Oui, révoquer', failure: 'Échec de la révocation. Réessayez.' },
}

// First name, else email (D24-C).
export function accountDisplayName(account) {
  return account.firstName || account.email
}

// "1 bébé et tout son suivi seront supprimés ; ce compte sera retiré de 2 bébés partagés." Rows at zero are
// hidden, and the sentence is empty when nothing is impacted (D24-P).
function impactSentence({ deletedBabyCount, sharedBabyCount }) {
  const parts = []
  if (deletedBabyCount === 1) parts.push('1 bébé et tout son suivi seront supprimés')
  if (deletedBabyCount >= 2) parts.push(`${deletedBabyCount} bébés et tout leur suivi seront supprimés`)
  if (sharedBabyCount === 1) parts.push('ce compte sera retiré de 1 bébé partagé')
  if (sharedBabyCount >= 2) parts.push(`ce compte sera retiré de ${sharedBabyCount} bébés partagés`)
  if (parts.length === 0) return ''
  const sentence = parts.join(' ; ')
  return `${sentence[0].toUpperCase()}${sentence.slice(1)}.`
}

function blockedMessage(name, count) {
  return count === 1
    ? `${name} est le dernier owner de 1 bébé suivi par d'autres : il faut d'abord désigner un autre owner depuis le Partage de ce bébé, ou le supprimer.`
    : `${name} est le dernier owner de ${count} bébés suivis par d'autres : il faut d'abord désigner un autre owner depuis le Partage de ces bébés, ou les supprimer.`
}

// What the confirmation says for a preview → { kind: 'activated' | 'blocked' | 'confirm', message }.
// A revocation of an account activated meanwhile outranks everything; a refusal outranks the confirmation (D24-Q).
export function describeAccountRemoval(mode, account, impact) {
  if (mode === 'revoke' && impact.status === 'active') {
    return { kind: 'activated', message: "Ce compte vient d'être activé." }
  }
  if (impact.blockingBabyCount > 0) {
    return { kind: 'blocked', message: blockedMessage(accountDisplayName(account), impact.blockingBabyCount) }
  }
  const sentence = impactSentence(impact)
  const withSentence = sentence ? ` ${sentence}` : ''
  if (mode === 'revoke') {
    return {
      kind: 'confirm',
      message: `Révoquer l'invitation de ${account.email} ? Son compte, jamais activé, sera supprimé et son lien ne fonctionnera plus.${withSentence}`,
    }
  }
  return {
    kind: 'confirm',
    message: `Supprimer le compte de ${accountDisplayName(account)} ?${withSentence} Action définitive.`,
  }
}
