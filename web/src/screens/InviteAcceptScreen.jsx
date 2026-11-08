import { useState } from 'react'
import { useInvitationPreview, useAcceptInvitation } from '../services/invitations'
import { useMe, useLogout } from '../services/session'
import { validateNewPassword } from '../password'

const ACCEPT_ERROR = {
  403: "Cette invitation est adressée à quelqu'un d'autre.",
  401: 'Votre session a expiré : reconnectez-vous.',
  400: 'Mot de passe trop court (12 caractères minimum).',
  409: 'Vous avez déjà accès à ce bébé.',
}

function Card({ title = 'Invitation de partage', children }) {
  return (
    <main className="auth-shell">
      <div className="card form auth-card auth-card--center">
        <h1 className="app-title">{title}</h1>
        {children}
      </div>
    </main>
  )
}

// Public screen reached via /invite?token=… The pre-flight tells whether the recipient still has to
// define a password (pending account) or must be connected as themself (activated account).
export default function InviteAcceptScreen({ token }) {
  const { preview, isLoading, error: previewError } = useInvitationPreview(token)
  const isExistingAccount = !!preview && !preview.needsPassword
  const { me, isLoading: isMeLoading } = useMe(isExistingAccount)
  const acceptMut = useAcceptInvitation(token)
  const logoutAndRefresh = useLogout()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState(null)
  const [isDone, setIsDone] = useState(false)
  const [isGone, setIsGone] = useState(false)

  if (!token) {
    return <p className="center">Lien d'invitation invalide (jeton manquant).</p>
  }
  if (isLoading || (isExistingAccount && isMeLoading)) {
    return <p className="center">…</p>
  }

  if (isDone) {
    return (
      <Card title="Invitation acceptée ✅">
        {preview.needsPassword ? (
          <>
            <p>Votre compte est prêt. Vous pouvez maintenant vous connecter.</p>
            <a href="/" className="btn btn--primary btn--block btn--lg">Se connecter</a>
          </>
        ) : (
          <>
            <p>Le bébé apparaît désormais dans votre liste.</p>
            <a href="/" className="btn btn--primary btn--block btn--lg">Accéder à l'accueil</a>
          </>
        )}
      </Card>
    )
  }

  if (isGone || previewError?.status === 410) {
    return (
      <Card>
        <p role="alert" className="error-text">Ce lien a expiré ou a déjà été utilisé. Demandez un nouveau lien.</p>
      </Card>
    )
  }
  if (previewError) {
    return (
      <Card>
        <p role="alert" className="error-text">Impossible de charger l'invitation. Réessayez plus tard.</p>
      </Card>
    )
  }

  function accept(passwordOrNull) {
    setMessage(null)
    acceptMut.mutate(passwordOrNull, {
      onSuccess: () => setIsDone(true),
      onError: (err) => {
        if (err?.status === 410) setIsGone(true)
        else setMessage(ACCEPT_ERROR[err?.status] ?? "Échec de l'acceptation. Réessayez.")
      },
    })
  }

  function handleSubmitPassword(e) {
    e.preventDefault()
    const problem = validateNewPassword(password, confirm)
    if (problem) {
      setMessage(problem)
      return
    }
    accept(password)
  }

  return (
    <Card>
      <p>{`${preview.inviterFirstName} vous invite à suivre ${preview.babyFirstName}.`}</p>

      {preview.needsPassword && (
        <form onSubmit={handleSubmitPassword} className="form">
          <p>{`Choisissez un mot de passe pour le compte ${preview.inviteeEmail}.`}</p>
          <label className="field">
            <span className="field-label">Mot de passe (12 caractères min.)</span>
            <input type="password" value={password} autoComplete="new-password"
                   onChange={(e) => setPassword(e.target.value)} className="input" />
          </label>
          <label className="field">
            <span className="field-label">Confirmer</span>
            <input type="password" value={confirm} autoComplete="new-password"
                   onChange={(e) => setConfirm(e.target.value)} className="input" />
          </label>
          {message && <p role="alert" className="error-text">{message}</p>}
          <button type="submit" disabled={acceptMut.isPending} className="btn btn--primary btn--block btn--lg">
            {acceptMut.isPending ? '…' : "Accepter l'invitation"}
          </button>
        </form>
      )}

      {isExistingAccount && !me && (
        <>
          <p>Connectez-vous d'abord pour accepter cette invitation.</p>
          <a href="/" className="btn btn--primary btn--block btn--lg">Se connecter</a>
        </>
      )}

      {isExistingAccount && me && (
        <>
          <p role="status" className="notice notice--info">
            Vous êtes connecté·e en tant que <strong>{me.firstName || me.email}</strong>.
          </p>
          <button onClick={logoutAndRefresh} className="linkbtn linkbtn--muted">
            Ce n'est pas vous ? Changer de compte
          </button>
          {message && <p role="alert" className="error-text">{message}</p>}
          <button
            onClick={() => accept(null)}
            disabled={acceptMut.isPending}
            className="btn btn--primary btn--block btn--lg"
          >
            {acceptMut.isPending ? '…' : "Accepter l'invitation"}
          </button>
        </>
      )}
    </Card>
  )
}
