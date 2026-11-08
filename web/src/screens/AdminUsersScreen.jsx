import { useState } from 'react'
import { useAccounts, useCreateAccount } from '../services/adminUsers'
import { ACCOUNT_ROLE_LABEL, ACCOUNT_STATUS_LABEL, formatAccountDate } from '../adminUsers'

const CREATE_ERROR = {
  400: 'Saisissez un email valide et un prénom.',
  409: 'Un compte existe déjà avec cet email.',
}

// Administrator's "Utilisateurs" screen: full-page view opened from the baby sheet header.
export default function AdminUsersScreen({ onBack }) {
  const { accounts, isLoading, isError } = useAccounts()
  const createMut = useCreateAccount()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [formError, setFormError] = useState(null)
  const [result, setResult] = useState(null) // last creation: { message, mailSent, link }
  const [copied, setCopied] = useState(false)

  function handleCreate(e) {
    e.preventDefault()
    if (!email.trim() || !firstName.trim()) {
      setFormError(CREATE_ERROR[400])
      return
    }
    setFormError(null)
    const typedEmail = email.trim()
    createMut.mutate({ email: typedEmail, firstName: firstName.trim() }, {
      onSuccess: (res) => {
        setResult({ message: `Compte créé, email envoyé à ${typedEmail}`, mailSent: res.mailSent, link: res.activationLink })
        setCopied(false)
        setEmail('')
        setFirstName('')
      },
      onError: (err) => setFormError(CREATE_ERROR[err?.status] ?? 'Échec de la création. Réessayez.'),
    })
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(result.link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main className="app">
      <header className="app-bar">
        <h1 className="app-title">Utilisateurs</h1>
        <button onClick={onBack} className="linkbtn linkbtn--muted">Retour</button>
      </header>

      <section className="card">
        <h2 className="card-title">Nouveau compte</h2>
        <form aria-label="Créer un compte" noValidate onSubmit={handleCreate} className="form">
          <label className="field">
            <span className="field-label">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </label>
          <label className="field">
            <span className="field-label">Prénom</span>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input" />
          </label>
          {formError && <p role="alert" className="error-text">{formError}</p>}
          <button type="submit" disabled={createMut.isPending} className="btn btn--primary btn--sm btn--start">
            {createMut.isPending ? '…' : 'Créer'}
          </button>
        </form>

        {result && (
          <div className="field">
            {result.mailSent
              ? <p role="status" className="notice notice--success">{result.message}</p>
              : (
                <p role="alert" className="notice notice--danger">
                  L'email n'a pas pu être envoyé : transmettez le lien vous-même.
                </p>
              )}
            <div className="modal-row">
              <input className="input" readOnly value={result.link} aria-label="Lien d'activation" onFocus={(e) => e.target.select()} />
              <button onClick={copyLink} className="btn btn--ghost btn--sm">
                {copied ? 'Copié' : 'Copier'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="card-title">Comptes</h2>
        {isLoading && <p className="empty">…</p>}
        {isError && <p role="alert" className="error-text">Impossible de charger les comptes.</p>}
        {!isLoading && !isError && (
          <ul className="event-list" aria-label="Comptes">
            {accounts.map((account) => (
              <li key={account.id} className="event-row">
                <div className="grow">
                  <div>{account.firstName || account.email}</div>
                  <div className="muted">{account.email}</div>
                  <div className="muted">
                    <span>{ACCOUNT_ROLE_LABEL[account.role]}</span>
                    {' · '}
                    <span>{ACCOUNT_STATUS_LABEL[account.status]}</span>
                    {' · '}
                    <span>Créé le {formatAccountDate(account.createdAt)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
