import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listCaregivers, createInvitation, removeCaregiver, promoteCaregiver } from '../api'
import { InlineDeleteConfirm } from './DeleteConfirm'

/**
 * Section « Partage » de la fiche bébé (Épic 8, Lot F). Liste le cercle du bébé (D8-N) et expose, aux
 * owners seulement (D8-J), la génération d'un lien d'invitation hors-bande (D8-B), la promotion (D8-I)
 * et la déliaison (D8-L). « Dernier owner » (D8-M) → message dédié sur le 409, pas une erreur générique.
 *
 * Invalidation par préfixe `['babies', babyId]` après chaque mutation (cf. Épic 7 D7-C) : la liste des
 * caregivers et l'état owner se rafraîchissent partout. Mutations `retry: 0` (anti-double-saisie, D3-G).
 */
export default function SharePanel({ babyId, me }) {
  const qc = useQueryClient()
  const [link, setLink] = useState(null)
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

  const inviteMut = useMutation({
    mutationFn: () => createInvitation(babyId),
    retry: 0,
    onSuccess: (res) => { setError(null); setCopied(false); setLink(res.link) },
    onError: () => setError("Échec de la génération du lien. Réessayez."),
  })

  const promoteMut = useMutation({
    mutationFn: (userId) => promoteCaregiver(babyId, userId),
    retry: 0,
    onSuccess: () => { setError(null); refresh(); setNotice('Caregiver promu owner.') },
    onError: () => setError('Échec de la promotion. Réessayez.'),
  })

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link)
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
        <div className="field">
          <button
            onClick={() => { setNotice(null); inviteMut.mutate() }}
            disabled={inviteMut.isPending}
            className="btn btn--primary btn--sm"
            style={{ alignSelf: 'flex-start' }}
          >
            {inviteMut.isPending ? '…' : "Générer un lien d'invitation"}
          </button>

          {link && (
            <div className="field" style={{ marginTop: '0.6rem' }}>
              <span className="field-hint">
                Valable 3 jours, à usage unique, à transmettre à un proche déjà inscrit.
              </span>
              <div className="modal-row">
                <input className="input" readOnly value={link} aria-label="Lien d'invitation" onFocus={(e) => e.target.select()} />
                <button onClick={copyLink} className="btn btn--ghost btn--sm">
                  {copied ? 'Copié' : 'Copier'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
