import { useState } from 'react'
import { activate } from '../api'

// "Set my password" screen (US1.2), reached via the single-use link /activate?token=…
export default function ActivationScreen({ token }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [state, setState] = useState('idle') // idle | done | error
  const [message, setMessage] = useState(null)

  if (!token) {
    return <p className="center">Lien d'activation invalide (jeton manquant).</p>
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setMessage(null)
    if (password.length < 12) {
      setMessage('Le mot de passe doit comporter au moins 12 caractères.')
      return
    }
    if (password !== confirm) {
      setMessage('Les deux mots de passe ne correspondent pas.')
      return
    }
    try {
      await activate(token, password)
      setState('done')
    } catch (err) {
      setState('error')
      setMessage(
        err.status === 410
          ? 'Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.'
          : err.status === 400
            ? 'Mot de passe trop court (12 caractères minimum).'
            : "Échec de l'activation. Réessayez."
      )
    }
  }

  if (state === 'done') {
    return (
      <main className="auth-shell">
        <div className="card" style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
          <h1 className="app-title">Compte activé ✅</h1>
          <p>Vous pouvez maintenant <a href="/">vous connecter</a>.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="auth-shell">
      <form onSubmit={handleSubmit} className="card form" style={{ width: '100%', maxWidth: 340 }}>
        <h1 className="app-title" style={{ textAlign: 'center' }}>Définir mon mot de passe</h1>
        <label className="field">
          <span className="field-label">Mot de passe (12 caractères min.)</span>
          <input type="password" value={password} required autoComplete="new-password"
                 onChange={(e) => setPassword(e.target.value)} className="input" />
        </label>
        <label className="field">
          <span className="field-label">Confirmer</span>
          <input type="password" value={confirm} required autoComplete="new-password"
                 onChange={(e) => setConfirm(e.target.value)} className="input" />
        </label>
        {message && <p className="error-text">{message}</p>}
        <button type="submit" className="btn btn--primary btn--block btn--lg">Activer mon compte</button>
      </form>
    </main>
  )
}
