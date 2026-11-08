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
