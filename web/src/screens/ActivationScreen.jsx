import { useState } from 'react'
import { activate } from '../api'

// "Set my password" screen (US1.2), reached via the single-use link /activate?token=…
export default function ActivationScreen({ token }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [state, setState] = useState('idle') // idle | done | error
  const [message, setMessage] = useState(null)

  if (!token) {
    return <p style={styles.center}>Lien d'activation invalide (jeton manquant).</p>
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
      <div style={styles.card}>
        <h1>Compte activé ✅</h1>
        <p>Vous pouvez maintenant <a href="/">vous connecter</a>.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={styles.card}>
      <h1>Définir mon mot de passe</h1>
      <label style={styles.label}>
        Mot de passe (12 caractères min.)
        <input type="password" value={password} required autoComplete="new-password"
               onChange={(e) => setPassword(e.target.value)} style={styles.input} />
      </label>
      <label style={styles.label}>
        Confirmer
        <input type="password" value={confirm} required autoComplete="new-password"
               onChange={(e) => setConfirm(e.target.value)} style={styles.input} />
      </label>
      {message && <p style={styles.error}>{message}</p>}
      <button type="submit" style={styles.button}>Activer mon compte</button>
    </form>
  )
}

const styles = {
  card: { display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 360, margin: '4rem auto', fontFamily: 'system-ui, sans-serif' },
  center: { textAlign: 'center', marginTop: '4rem', fontFamily: 'system-ui, sans-serif' },
  label: { display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.9rem' },
  input: { padding: '.6rem', fontSize: '1rem', borderRadius: 6, border: '1px solid #ccc' },
  button: { padding: '.7rem', fontSize: '1rem', borderRadius: 6, border: 0, background: '#3b82f6', color: '#fff', cursor: 'pointer' },
  error: { color: '#dc2626', fontSize: '.9rem', margin: 0 },
}
