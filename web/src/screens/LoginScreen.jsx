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
    <form onSubmit={handleSubmit} style={styles.card}>
      <h1>Suivi Baby</h1>
      <label style={styles.label}>
        Email
        <input type="email" value={email} required autoComplete="username"
               onChange={(e) => setEmail(e.target.value)} style={styles.input} />
      </label>
      <label style={styles.label}>
        Mot de passe
        <input type="password" value={password} required autoComplete="current-password"
               onChange={(e) => setPassword(e.target.value)} style={styles.input} />
      </label>
      {error && <p style={styles.error}>{error}</p>}
      <button type="submit" disabled={busy} style={styles.button}>
        {busy ? '…' : 'Se connecter'}
      </button>
    </form>
  )
}

const styles = {
  card: { display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 320, margin: '4rem auto', fontFamily: 'system-ui, sans-serif' },
  label: { display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.9rem' },
  input: { padding: '.6rem', fontSize: '1rem', borderRadius: 6, border: '1px solid #ccc' },
  button: { padding: '.7rem', fontSize: '1rem', borderRadius: 6, border: 0, background: '#3b82f6', color: '#fff', cursor: 'pointer' },
  error: { color: '#dc2626', fontSize: '.9rem', margin: 0 },
}
