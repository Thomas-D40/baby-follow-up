import { useAccounts } from '../services/adminUsers'
import { ACCOUNT_ROLE_LABEL, ACCOUNT_STATUS_LABEL, formatAccountDate } from '../adminUsers'

// Administrator's "Utilisateurs" screen: full-page view opened from the baby sheet header.
export default function AdminUsersScreen({ onBack }) {
  const { accounts, isLoading, isError } = useAccounts()

  return (
    <main className="app">
      <header className="app-bar">
        <h1 className="app-title">Utilisateurs</h1>
        <button onClick={onBack} className="linkbtn linkbtn--muted">Retour</button>
      </header>

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
