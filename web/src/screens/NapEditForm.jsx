import { useState } from 'react'
import { toLocalInputValue, toOccurredAtIso } from '../stool'

/**
 * Formulaire d'édition d'une sieste (Épic 8, DA-1/DA-3). Contrairement au biberon/selle, la sieste
 * n'a pas de formulaire de **création** (son cycle de vie passe par start/end/reopen, cf. `NapPanel`) :
 * ce formulaire est donc dédié à la **correction** d'une sieste déjà **terminée** (`startAt` + `endAt`).
 *
 * Choix face au 409 (DA-3) : l'édition n'est exposée par le panel que sur les siestes **fermées**, donc
 * `endAt` est toujours renseigné ici → on ne tente jamais de fermer une sieste ouverte. Le 409 est
 * néanmoins géré défensivement (course : la sieste rouverte ailleurs) par un message clair plutôt qu'une
 * erreur générique. La borne `endAt ≥ startAt` est validée côté client (miroir serveur) avant l'appel.
 *
 * `onSubmit(patch)` renvoie une promesse ; le bouton est désactivé jusqu'au *settled* (anti double-submit,
 * DA-4). Le sheet appelant se ferme au succès.
 */
export default function NapEditForm({ onSubmit, initial }) {
  const [startAt, setStartAt] = useState(() => toLocalInputValue(new Date(initial.startAt)))
  const [endAt, setEndAt] = useState(() =>
    toLocalInputValue(initial.endAt ? new Date(initial.endAt) : new Date()),
  )
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const startIso = toOccurredAtIso(startAt)
    const endIso = toOccurredAtIso(endAt)
    if (!startIso || !endIso) {
      setError('Date invalide.')
      return
    }
    if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
      setError('La fin doit être postérieure au début.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({ startAt: startIso, endAt: endIso })
      setBusy(false)
    } catch (err) {
      if (err?.status === 409) {
        setError('Sieste en cours : terminez-la d’abord.')
      } else if (err?.status === 400) {
        setError('Données invalides.')
      } else {
        setError("Échec de l'enregistrement.")
      }
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      <label className="field">
        <span className="field-label">Début</span>
        <input
          type="datetime-local"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          className="input"
        />
      </label>
      <label className="field">
        <span className="field-label">Fin</span>
        <input
          type="datetime-local"
          value={endAt}
          onChange={(e) => setEndAt(e.target.value)}
          className="input"
        />
      </label>
      {error && <p className="error-text">{error}</p>}
      <button type="submit" disabled={busy} className="btn btn--sleep btn--block btn--lg">{busy ? '…' : 'Enregistrer'}</button>
    </form>
  )
}
