import { useState } from 'react'
import { toLocalInputValue, toOccurredAtIso } from '../stool'

/**
 * Formulaire de saisie d'une selle (US5.1). Saisie en 1 tap : `occurredAt` prérempli sur
 * « maintenant », tous les champs optionnels (consistance, heure) repliés derrière « Préciser… ».
 * `onSubmit` renvoie une promesse ; le bouton est désactivé jusqu'au *settled* de la mutation →
 * anti double-saisie (D5-J / D3-G). Sur succès, on réinitialise pour enchaîner ; échec apparent →
 * message clair + resoumission manuelle. La couleur est hors périmètre v1 (D5-F).
 */
export default function StoolForm({ onSubmit }) {
  const [occurredAt, setOccurredAt] = useState(() => toLocalInputValue(new Date()))
  const [consistency, setConsistency] = useState('')
  const [showDetails, setShowDetails] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    const iso = toOccurredAtIso(occurredAt)
    if (!iso) {
      setError('Date invalide.')
      return
    }
    setBusy(true)
    try {
      await onSubmit({ occurredAt: iso, consistency: consistency || null })
      setConsistency('') // prêt pour une saisie suivante (le formulaire reste monté)
      setOccurredAt(toLocalInputValue(new Date()))
      setShowDetails(false)
      setBusy(false)
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={styles.form}>
      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        style={styles.toggle}
        aria-expanded={showDetails}
      >
        {showDetails ? '− Masquer les détails' : '+ Préciser (consistance, heure)'}
      </button>

      {showDetails && (
        <>
          <label style={styles.label}>
            Consistance
            <select value={consistency} onChange={(e) => setConsistency(e.target.value)} style={styles.input}>
              <option value="">—</option>
              <option value="hard">Dure</option>
              <option value="soft">Molle</option>
              <option value="liquid">Liquide</option>
            </select>
          </label>
          <label style={styles.label}>
            Quand
            <input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              style={styles.input}
            />
          </label>
        </>
      )}

      {error && <p style={styles.error}>{error}</p>}
      <button type="submit" disabled={busy} style={styles.button}>{busy ? '…' : 'Enregistrer'}</button>
    </form>
  )
}

const styles = {
  form: { display: 'flex', flexDirection: 'column', gap: '.8rem' },
  toggle: { alignSelf: 'flex-start', background: 'none', border: 0, color: '#3b82f6', cursor: 'pointer', padding: 0, font: 'inherit' },
  label: { display: 'flex', flexDirection: 'column', gap: '.3rem', fontSize: '.9rem' },
  input: { padding: '.6rem', fontSize: '1rem', borderRadius: 6, border: '1px solid #ccc' },
  button: { padding: '.7rem', fontSize: '1rem', borderRadius: 6, border: 0, background: '#3b82f6', color: '#fff', cursor: 'pointer' },
  error: { color: '#dc2626', fontSize: '.9rem', margin: 0 },
}
