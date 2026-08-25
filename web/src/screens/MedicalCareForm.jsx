import { useState } from 'react'
import { careTypeOfEvent, medicalCareLabel } from '../medicalCare'
import { toLocalInputValue, toOccurredAtIso } from '../stool'

/**
 * Saisie / correction d'un soin (US15.2). Formulaire **contrôlé pur** : `onSubmit` renvoie une
 * promesse, le bouton est désactivé jusqu'au *settled* → anti double-saisie.
 *
 * Mode **création** : heure + deux toggles « Yeux » / « Nez » (au moins un requis) → **un seul**
 * appel `POST …/medical-care-acts`, l'endpoint composite transactionnel (D15-M).
 * ⛔ Jamais `Promise.all` de deux `POST` : deux requêtes pour un seul geste, ce serait deux boutons
 * à désactiver et deux états d'erreur, et un échec partiel invisible rouvrirait le trou anti-doublon.
 *
 * Mode **édition** (`initial`) : on repasse par la **ressource** (`PATCH /medical-cares/{id}`),
 * jamais par l'acte composite — corriger l'heure d'un soin existant n'est pas noter un nouvel acte.
 */
export default function MedicalCareForm({ onSubmit, initial = null }) {
  const isEdit = initial != null
  // ⚠️ Point de traduction du vocabulaire (K1) : la ligne éditée vient du récap ou du panneau et
  // porte un type de PRÉSENTATION ('eye_care' | 'nose_care'), alors que la ressource parle
  // `careType` ('eye' | 'nose'). Ici il ne sert QU'À AFFICHER le libellé : le type n'est pas
  // modifiable en édition (on corrige l'heure), donc il ne part pas dans le PATCH.
  const careType = isEdit ? careTypeOfEvent(initial.type) : null

  const [withEye, setWithEye] = useState(false)
  const [withNose, setWithNose] = useState(false)
  const [occurredAt, setOccurredAt] = useState(() =>
    toLocalInputValue(initial?.occurredAt ? new Date(initial.occurredAt) : new Date()),
  )
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const nothingSelected = !isEdit && !withEye && !withNose

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (nothingSelected) {
      setError('Cochez au moins « Yeux » ou « Nez ».')
      return
    }
    const iso = toOccurredAtIso(occurredAt)
    if (!iso) {
      setError('Date invalide.')
      return
    }
    setBusy(true)
    try {
      // One gesture, ONE request: the act on creation, the resource patch on edit. The patch carries
      // ONLY what is being edited — resending an immutable `careType` would rewrite it on every time
      // correction, since MedicalCareService.update applies whatever it receives (cf. UrineForm).
      await onSubmit(isEdit ? { occurredAt: iso } : { occurredAt: iso, withEye, withNose })
      if (!isEdit) {
        setWithEye(false)
        setWithNose(false)
        setOccurredAt(toLocalInputValue(new Date()))
      }
      setBusy(false)
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form" aria-label={isEdit ? 'Modifier le soin' : 'Soin médical'}>
      {isEdit ? (
        <p className="field-hint">Soin : {medicalCareLabel(careType)}</p>
      ) : (
        <div className="toggle-row" role="group" aria-label="Type de soin">
          <button
            type="button"
            className={`toggle-chip ${withEye ? 'toggle-chip--care-on' : ''}`}
            aria-pressed={withEye}
            onClick={() => setWithEye((v) => !v)}
          >
            <span aria-hidden="true">👁</span> Yeux
          </button>
          <button
            type="button"
            className={`toggle-chip ${withNose ? 'toggle-chip--care-on' : ''}`}
            aria-pressed={withNose}
            onClick={() => setWithNose((v) => !v)}
          >
            <span aria-hidden="true">👃</span> Nez
          </button>
        </div>
      )}

      <label className="field">
        <span className="field-label">Quand</span>
        <input
          type="datetime-local"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="input"
        />
      </label>

      {error && <p className="error-text">{error}</p>}
      <button type="submit" disabled={busy || nothingSelected} className="btn btn--care btn--block btn--lg">
        {busy ? '…' : 'Enregistrer'}
      </button>
    </form>
  )
}
