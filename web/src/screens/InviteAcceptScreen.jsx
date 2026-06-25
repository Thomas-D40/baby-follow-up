import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchMe, logout, acceptInvitation } from '../api'

/**
 * Écran d'acceptation d'une invitation de partage (Épic 8, Lot F), atteint via /invite?token=…
 *
 * D8-E (confirmation d'identité, critique) : on récupère le compte connecté via `fetchMe`.
 * - Non connecté → invite à se connecter (le token reste dans l'URL ; après login l'utilisateur
 *   revient sur /invite?token=…).
 * - Connecté → on affiche clairement « connecté·e en tant que <email> » + un bouton « Ce n'est pas
 *   vous ? Changer de compte » (logout puis re-login) AVANT le bouton « Accepter ». Empêche
 *   d'accepter aveuglément avec le mauvais compte sur un appareil partagé (R2).
 *
 * L'acceptation (`retry: 0`, anti-double-saisie) lie le courant en non-owner (D8-F). 410 → lien
 * expiré/déjà utilisé ; 409 → déjà membre de ce bébé.
 */
export default function InviteAcceptScreen({ token }) {
  const qc = useQueryClient()
  const [state, setState] = useState('idle') // idle | submitting | done | error
  const [message, setMessage] = useState(null)

  const { data: me, isLoading } = useQuery({ queryKey: ['me'], queryFn: fetchMe })

  if (!token) {
    return <p className="center">Lien d'invitation invalide (jeton manquant).</p>
  }

  if (isLoading) {
    return <p className="center">…</p>
  }

  async function handleChangeAccount() {
    await logout()
    // Re-login : on revient sur /invite?token=… après authentification (le token est déjà dans l'URL).
    qc.invalidateQueries({ queryKey: ['me'] })
  }

  async function handleAccept() {
    setState('submitting')
    setMessage(null)
    try {
      await acceptInvitation(token)
      setState('done')
    } catch (err) {
      setState('error')
      setMessage(
        err.status === 410
          ? 'Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.'
          : err.status === 409
            ? 'Vous avez déjà accès à ce bébé.'
            : "Échec de l'acceptation. Réessayez."
      )
    }
  }

  if (state === 'done') {
    return (
      <main className="auth-shell">
        <div className="card" style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
          <h1 className="app-title">Invitation acceptée ✅</h1>
          <p>Le bébé apparaît désormais dans votre liste.</p>
          <a href="/" className="btn btn--primary btn--block btn--lg">Accéder à l'accueil</a>
        </div>
      </main>
    )
  }

  // Non connecté (D8-E) : on renvoie au login ; le token reste dans l'URL pour le retour.
  if (!me) {
    return (
      <main className="auth-shell">
        <div className="card" style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
          <h1 className="app-title">Invitation de partage</h1>
          <p>Connectez-vous d'abord pour accepter cette invitation.</p>
          <a href="/" className="btn btn--primary btn--block btn--lg">Se connecter</a>
        </div>
      </main>
    )
  }

  // Connecté (D8-E) : confirmation d'identité explicite AVANT le bouton « Accepter ».
  return (
    <main className="auth-shell">
      <div className="card form" style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>
        <h1 className="app-title">Invitation de partage</h1>
        <p role="status" className="notice notice--info">
          Vous êtes connecté·e en tant que <strong>{me.firstName || me.email}</strong>.
        </p>
        <button onClick={handleChangeAccount} className="linkbtn linkbtn--muted">
          Ce n'est pas vous ? Changer de compte
        </button>
        {message && <p role="alert" className="error-text">{message}</p>}
        <button
          onClick={handleAccept}
          disabled={state === 'submitting'}
          className="btn btn--primary btn--block btn--lg"
        >
          {state === 'submitting' ? '…' : "Accepter l'invitation"}
        </button>
      </div>
    </main>
  )
}
