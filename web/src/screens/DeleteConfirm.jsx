import { useState } from 'react'

/**
 * Confirmation de suppression (Épic 7, D7-B). La **logique** est dans `useDeleteEvent` ; ici on ne
 * partage que la **présentation**. Deux formes selon la surface, **libellés et états mutualisés** pour
 * qu'elles ne dérivent pas (R5) :
 * - `InlineDeleteConfirm` : bloc inline pour les items spacieux des panels de la fiche bébé (idiome
 *   `BabiesScreen`).
 * - `ConfirmDeleteModal` : modale pour la liste dense du calendrier (un bloc inline déformerait la
 *   frise du jour).
 *
 * Convention `onDelete` : renvoie une **promesse** (typiquement `mutateAsync`) ; un 404 idempotent
 * résout (D7-C), un 401/403/500 rejette → erreur affichée (R3).
 */

// Libellés partagés par les deux formes (R5) — une seule source de vérité.
export const DELETE_LABELS = {
  trigger: 'Supprimer',
  confirm: 'Oui, supprimer',
  cancel: 'Annuler',
  pending: '…',
  error: 'Échec de la suppression.',
}

/** Bloc inline pour un item de liste de panel. Gère l'état confirming/pending/erreur localement. */
export function InlineDeleteConfirm({ prompt, triggerAriaLabel, onDelete, onDeleted }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  if (!confirming) {
    return (
      <button onClick={() => setConfirming(true)} className="icon-btn" aria-label={triggerAriaLabel} title={DELETE_LABELS.trigger}>
        🗑
      </button>
    )
  }

  const run = async () => {
    setError(false)
    setPending(true)
    try {
      await onDelete()
      onDeleted?.() // succès (y compris 404 idempotent) : l'item disparaît, ce bloc se démonte
    } catch {
      setPending(false)
      setError(true) // 401/403/500 (R3)
    }
  }

  return (
    <span className="confirm-inline" role="group">
      <span className="prompt">{prompt}</span>
      <button onClick={run} disabled={pending} className="btn btn--danger btn--sm">
        {pending ? DELETE_LABELS.pending : DELETE_LABELS.confirm}
      </button>
      <button onClick={() => setConfirming(false)} disabled={pending} className="btn btn--ghost btn--sm">
        {DELETE_LABELS.cancel}
      </button>
      {error && <span role="alert" className="error-text">{DELETE_LABELS.error}</span>}
    </span>
  )
}

/** Modale pour la liste dense du calendrier. État (pending/erreur) piloté par l'appelant. */
export function ConfirmDeleteModal({ prompt, pending, error, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" role="presentation" onClick={onCancel}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={prompt} onClick={(e) => e.stopPropagation()}>
        <p>{prompt}</p>
        {error && <p role="alert" className="error-text">{DELETE_LABELS.error}</p>}
        <div className="modal-row">
          <button onClick={onCancel} disabled={pending} className="btn btn--ghost">
            {DELETE_LABELS.cancel}
          </button>
          <button onClick={onConfirm} disabled={pending} className="btn btn--danger">
            {pending ? DELETE_LABELS.pending : DELETE_LABELS.confirm}
          </button>
        </div>
      </div>
    </div>
  )
}
