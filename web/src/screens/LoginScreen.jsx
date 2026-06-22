import { useState } from 'react'
import { login } from '../api'

// Login screen (US1.3). On success, invalidate /api/me to re-read the logged-in state.
export default function LoginScreen({ onLoggedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await login(email, password)
      onLoggedIn()
    } catch {
      // Generic 401: we do not distinguish unknown email from wrong password.
      setError('Email ou mot de passe incorrect.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-shell">
      <form onSubmit={handleSubmit} className="card form" style={{ width: '100%', maxWidth: 340 }}>
        <h1 className="app-title" style={{ textAlign: 'center' }}><span className="logo">🍼</span>Suivi Baby</h1>
        <label className="field">
          <span className="field-label">Email</span>
          <input type="email" value={email} required autoComplete="username"
                 onChange={(e) => setEmail(e.target.value)} className="input" />
        </label>
        <label className="field">
          <span className="field-label">Mot de passe</span>
          <input type="password" value={password} required autoComplete="current-password"
                 onChange={(e) => setPassword(e.target.value)} className="input" />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={busy} className="btn btn--primary btn--block btn--lg">
          {busy ? '…' : 'Se connecter'}
        </button>
      </form>
    </main>
  )
}
