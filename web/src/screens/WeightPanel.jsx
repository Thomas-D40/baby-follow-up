import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getWeightHistory, upsertWeight, deleteWeight } from '../api'
import { parisToday } from '../calendar'
import { InlineDeleteConfirm } from './DeleteConfirm'

// Weight entry / list / correction (US12.1). Weight = date-keyed day-state (D12-A′): writing is
// a "last-writer-wins" upsert (D12-C′), so a SINGLE inline form (date + weight in g) serves
// both entry AND correction — no edit sheet nor separate `WeightForm` component (that fork is only
// useful for the bottle, keyed `{id}`). ✏️ on a row pre-fills the form (same date → re-entry of the day).
// LOCAL deletion via `deleteWeight(babyId, day)` (204 idempotent) — NOT `useDeleteEvent`, whose
// `(babyId, id)` contract is incompatible with date keying (D12-F). Fixing the DAY of a
// mis-dated weigh-in = delete the old day then enter the right one (rare case).
// Writes with `retry: 0` (no replay that would duplicate on a lost response); on success, invalidation
// by PREFIX `['babies', babyId]` → refreshes the list AND the curve (`weight-history`).
export default function WeightPanel({ babyId }) {
  const qc = useQueryClient()
  const key = ['babies', babyId, 'weight-history']
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => getWeightHistory(babyId) })
  const invalidate = () => qc.invalidateQueries({ queryKey: ['babies', babyId] }) // prefix (list + curve)

  const [day, setDay] = useState(() => parisToday())
  const [grams, setGrams] = useState('')
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  const putMut = useMutation({
    mutationFn: ({ date, weightGrams }) => upsertWeight(babyId, date, weightGrams),
    retry: 0,
    onSuccess: () => { invalidate(); setNotice('Poids enregistré.') },
  })
  const deleteMut = useMutation({
    mutationFn: (date) => deleteWeight(babyId, date),
    retry: 0,
    onSuccess: invalidate,
  })

  const points = data?.points ?? []
  const rows = [...points].sort((a, b) => (a.givenOn < b.givenOn ? 1 : -1)) // given_on DESC for display

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const value = Number.parseInt(grams, 10)
    if (!day) { setError('Date requise.'); return }
    if (!Number.isFinite(value) || value <= 0 || value > 30000) {
      setError('Poids invalide (en grammes, 0 < g ≤ 30000).')
      return
    }
    try {
      await putMut.mutateAsync({ date: day, weightGrams: value })
      setGrams('')
    } catch (err) {
      setError(err?.status === 400 ? 'Données invalides.' : "Échec de l'enregistrement.")
    }
  }

  const editRow = (r) => { setNotice(null); setError(null); setDay(r.givenOn); setGrams(String(r.weightGrams)) }

  return (
    <>
      <form onSubmit={handleSubmit} className="form">
        <label className="field">
          <span className="field-label">Jour</span>
          <input
            type="date"
            value={day}
            max={parisToday()}
            onChange={(e) => setDay(e.target.value)}
            className="input"
          />
        </label>
        <label className="field">
          <span className="field-label">Poids (g)</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="30000"
            step="1"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="input"
            placeholder="ex. 4200"
          />
        </label>
        {error && <p className="error-text">{error}</p>}
        <button type="submit" disabled={putMut.isPending} className="btn btn--primary btn--block btn--lg">
          {putMut.isPending ? '…' : 'Enregistrer'}
        </button>
      </form>

      {notice && <p role="status" className="notice notice--success">{notice}</p>}

      <h4 className="subtitle">Historique des pesées</h4>
      {isLoading ? (
        <p className="empty">…</p>
      ) : rows.length === 0 ? (
        <p className="empty">Aucune pesée enregistrée.</p>
      ) : (
        <ul className="event-list">
          {rows.map((r) => (
            <li key={r.givenOn} className="event-row">
              <span className="grow">
                <span className="event-time">{r.givenOn}</span>{' · '}
                <strong>{(r.weightGrams / 1000).toFixed(3)} kg</strong>
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--edit"
                aria-label={`Corriger le poids du ${r.givenOn}`}
                title="Corriger"
                onClick={() => editRow(r)}
              >
                ✏️
              </button>
              <InlineDeleteConfirm
                prompt="Supprimer cette pesée ?"
                triggerAriaLabel={`Supprimer le poids du ${r.givenOn}`}
                onDelete={() => deleteMut.mutateAsync(r.givenOn)}
                onDeleted={() => setNotice('Poids supprimé.')}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
