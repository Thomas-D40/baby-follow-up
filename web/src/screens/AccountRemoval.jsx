import { useState } from 'react'
import { useAccountDeletionImpact, useDeleteAccount } from '../services/adminUsers'
import { ACCOUNT_REMOVAL_LABELS, describeAccountRemoval } from '../adminUsers'

// Per-row removal of an account on the administrator's "Utilisateurs" screen (Épic 24). The preview of what
// the removal does is read when the confirmation opens; the confirmation sends back its fingerprint.
// Same markup and wording as InlineDeleteConfirm, which cannot load a text asynchronously nor show a refusal.
export default function AccountRemoval({ account }) {
  const [mode, setMode] = useState(null) // null = closed; frozen from the opening to the closing (delete|revoke)
  const [isRefreshed, setIsRefreshed] = useState(false) // the last confirmation hit a changed impact
  const [hasFailed, setHasFailed] = useState(false)
  const { impact, isFetching, isError, refetch } = useAccountDeletionImpact(account, mode !== null)
  const deleteMut = useDeleteAccount()

  function open() {
    setIsRefreshed(false)
    setHasFailed(false)
    setMode(modeFor(account))
    // Reopened after an "activated" refusal, the preview query never got disabled: read it again explicitly.
    if (mode !== null) refetch()
  }

  function close() {
    setMode(null)
    setIsRefreshed(false)
    setHasFailed(false)
  }

  function handleConfirm() {
    setIsRefreshed(false)
    setHasFailed(false)
    deleteMut.mutate(
      { userId: account.id, impactToken: impact.impactToken, isPendingOnly: mode === 'revoke' },
      { onError: (err) => (err?.status === 409 ? setIsRefreshed(true) : setHasFailed(true)) },
    )
  }

  // A failed re-read keeps the previous preview in the cache: it must not be shown nor confirmed.
  const view = mode !== null && impact && !isError ? describeAccountRemoval(mode, account, impact) : null
  // The account got activated since the list was loaded: the confirmation closes and the row says why.
  if (mode === null || view?.kind === 'activated') {
    return (
      <>
        <button onClick={open} className="btn btn--ghost btn--sm">
          {ACCOUNT_REMOVAL_LABELS[modeFor(account)].trigger}
        </button>
        {view && <p role="alert" className="notice notice--info">{view.message}</p>}
      </>
    )
  }

  const labels = ACCOUNT_REMOVAL_LABELS[mode]
  return (
    <span className="confirm-inline" role="group">
      {isError && <p role="alert" className="error-text">{labels.failure}</p>}
      {!isError && !view && <span className="prompt">…</span>}
      {isRefreshed && <p role="status" className="notice notice--info">L'impact a changé : vérifiez avant de confirmer.</p>}
      {view && <span className="prompt">{view.message}</span>}
      {view?.kind === 'confirm' && (
        <button
          onClick={handleConfirm}
          disabled={isFetching || deleteMut.isPending}
          className="btn btn--danger btn--sm"
        >
          {deleteMut.isPending ? '…' : labels.confirm}
        </button>
      )}
      <button onClick={close} disabled={deleteMut.isPending} className="btn btn--ghost btn--sm">Annuler</button>
      {hasFailed && <p role="alert" className="error-text">{labels.failure}</p>}
    </span>
  )
}

// A pending account has never been used: removing it withdraws its invitation.
function modeFor(account) {
  return account.status === 'pending' ? 'revoke' : 'delete'
}
