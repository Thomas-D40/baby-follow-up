import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listCaregivers, removeCaregiver, promoteCaregiver } from '../api'
import { useCreateInvitation } from '../services/invitations'
import { InlineDeleteConfirm } from './DeleteConfirm'

const INVITE_ERROR = {
  409: 'Cette personne fait déjà partie du cercle.',
  400: "Vérifiez l'email et le prénom.",
}

// "Partage" section of the baby sheet: lists the baby's circle (D8-N) and, to owners only, exposes the
// invitation by email (D17), promotion (D8-I) and removal (D8-L). 409 on removal = last owner (D8-M),
// with its own message. Mutations use retry: 0 (anti double-submit, D3-G) and the prefix invalidation
// ['babies', babyId] (Épic 7 D7-C) refreshes the circle everywhere.
export default function SharePanel({ babyId, me }) {
  const qc = useQueryClient()
  const createInvitationMut = useCreateInvitation(babyId)
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [invitation, setInvitation] = useState(null) // last emission result, kept to show the link
  const [copied, setCopied] = useState(false)
  const [notice, setNotice] = useState(null)
  const [error, setError] = useState(null)

  const { data: caregivers = [], isLoading } = useQuery({
    queryKey: ['babies', babyId, 'caregivers'],
    queryFn: () => listCaregivers(babyId),
    enabled: !!babyId,
  })

  // Le courant est-il owner de CE bébé ? Déduit de la liste + identité courante (pas de champ dédié).
  const iAmOwner = caregivers.some((c) => c.userId === me.id && c.isOwner)

  const refresh = () => qc.invalidateQueries({ queryKey: ['babies', babyId] })

  const promoteMut = useMutation({
    mutationFn: (userId) => promoteCaregiver(babyId, userId),
    retry: 0,
    onSuccess: () => { setError(null); refresh(); setNotice('Caregiver promu owner.') },
    onError: () => setError('Échec de la promotion. Réessayez.'),
  })

  function handleInvite(e) {
    e.preventDefault()
    setNotice(null)
    if (!email.trim() || !firstName.trim()) {
      setError("Renseignez l'email et le prénom du proche.")
      return
    }
    setError(null)
    createInvitationMut.mutate({ email: email.trim(), firstName: firstName.trim() }, {
      onSuccess: (res) => {
        setInvitation(res)
        setCopied(false)
        setEmail('')
        setFirstName('')
        setNotice(res.mailSent ? `Invitation envoyée par email à ${res.inviteeEmail}.` : null)
      },
      onError: (err) => setError(INVITE_ERROR[err?.status] ?? "Échec de l'invitation. Réessayez."),
    })
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invitation.link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  if (isLoading) return <section className="card"><p className="empty">…</p></section>

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title"><span aria-hidden="true">👪</span> Partage</h2>
      </div>

      {notice && <p role="status" className="notice notice--success">{notice}</p>}
      {error && <p role="alert" className="error-text">{error}</p>}

      <ul className="event-list">
        {caregivers.map((c) => {
          const isMe = c.userId === me.id
          return (
            <li key={c.userId} className="event-row">
              <span className="grow">
                {c.firstName || c.email}
                {isMe && <span className="muted"> (vous)</span>}
                {c.isOwner && <span className="chip chip--milk" style={{ marginLeft: '0.4rem' }}>owner</span>}
              </span>
              {iAmOwner && !c.isOwner && (
                <button
                  onClick={() => promoteMut.mutate(c.userId)}
                  disabled={promoteMut.isPending}
                  className="btn btn--ghost btn--sm"
                >
                  Promouvoir
                </button>
              )}
              {iAmOwner && (
                <InlineDeleteConfirm
                  prompt={`Retirer ${c.firstName || c.email} du partage ?`}
                  triggerAriaLabel={`Retirer ${c.firstName || c.email}`}
                  onDelete={() => removeCaregiver(babyId, c.userId)}
                  onDeleted={() => { setError(null); refresh(); setNotice('Caregiver retiré.') }}
                  onError={(err) => setError(
                    err?.status === 409
                      ? "Impossible de retirer le dernier owner : désignez d'abord un autre owner."
                      : 'Échec du retrait. Réessayez.'
                  )}
                />
              )}
            </li>
          )
        })}
      </ul>

      {iAmOwner && (
        <form aria-label="Inviter un proche" noValidate onSubmit={handleInvite} className="form">
          <label className="field">
            <span className="field-label">Email du proche</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </label>
          <label className="field">
            <span className="field-label">Prénom du proche</span>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="input" />
          </label>
          <button type="submit" disabled={createInvitationMut.isPending} className="btn btn--primary btn--sm btn--start">
            {createInvitationMut.isPending ? '…' : "Envoyer l'invitation"}
          </button>
        </form>
      )}

      {iAmOwner && invitation && !invitation.mailSent && (
        <p role="alert" className="notice notice--danger">
          L'email n'a pas pu être envoyé : transmettez le lien vous-même.
        </p>
      )}

      {iAmOwner && invitation && (
        <div className="field">
          <span className="field-hint">
            Valable 3 jours, à usage unique, réservé à {invitation.inviteeEmail}.
          </span>
          <div className="modal-row">
            <input className="input" readOnly value={invitation.link} aria-label="Lien d'invitation" onFocus={(e) => e.target.select()} />
            <button onClick={copyLink} className="btn btn--ghost btn--sm">
              {copied ? 'Copié' : 'Copier'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
