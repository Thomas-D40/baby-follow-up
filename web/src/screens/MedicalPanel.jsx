import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTemperature, listTemperatures, updateTemperature } from '../api'
import { describeMedication } from '../medication'
import { useUpdateEvent } from '../services/events'
import { useCreateMedication, useMedicationList } from '../services/medications'
import { formatCelsius } from '../temperature'
import { useDeleteEvent } from '../useDeleteEvent'
import { InlineDeleteConfirm } from './DeleteConfirm'
import BottomSheet from './BottomSheet'
import MedicationForm from './MedicationForm'
import TemperatureForm from './TemperatureForm'

// Display cap PER TYPE (temperatures, medications), deliberately NOT `slice(0, 10)` on the merged
// list like DiaperChangePanel: capping the MERGE could evict every temperature from the very list
// where it was just entered. 5 + 5 costs zero extra request — the two lists are already fetched
// separately. Display cap only: the recap chips and the day timeline never rely on it.
const RECENT_PER_TYPE = 5

// "Medical" surface (US15.1, US19.1; D22-C / D22-H): one sheet for temperature and medication, plus
// the "Derniers actes médicaux" list. Eye and nose care live in `CarePanel` (D22-A).
// `DiaperChangePanel` pattern: writes run with `retry: 0` (no automatic replay that would duplicate
// on a lost response) and the PREFIX invalidation `['babies', babyId]` on success refreshes the
// local list AND the recap (events + daily-totals), which derive from the same events.
export default function MedicalPanel({ babyId }) {
  const qc = useQueryClient()
  const [notice, setNotice] = useState(null)
  const [editing, setEditing] = useState(null) // { type, item } en cours d'édition, ou null

  const temperaturesQuery = useQuery({
    queryKey: ['babies', babyId, 'temperatures'],
    queryFn: () => listTemperatures(babyId),
  })

  const createTemperatureMut = useMutation({
    mutationFn: (body) => createTemperature(babyId, body),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      setNotice('Température enregistrée.')
    },
  })
  const temperatureUpdateMut = useMutation({
    mutationFn: ({ id, patch }) => updateTemperature(babyId, id, patch),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      setEditing(null)
      setNotice('Température mise à jour.')
    },
  })
  const deleteMut = useDeleteEvent(babyId)
  const { medications, isLoading: medicationsLoading } = useMedicationList(babyId)
  const createMedicationMut = useCreateMedication(babyId, {
    onSuccess: () => setNotice('Médicament enregistré.'),
  })
  const updateMedicationMut = useUpdateEvent(babyId, {
    onSuccess: () => {
      setEditing(null)
      setNotice('Médicament mis à jour.')
    },
  })

  const isLoading = temperaturesQuery.isLoading || medicationsLoading
  const items = [
    ...(temperaturesQuery.data?.items ?? []).slice(0, RECENT_PER_TYPE).map((t) => ({ ...t, type: 'temperature' })),
    ...medications.slice(0, RECENT_PER_TYPE).map((m) => ({ ...m, type: 'medication' })),
  ].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))

  return (
    <>
      <h4 className="subtitle">Température</h4>
      <TemperatureForm onSubmit={(body) => createTemperatureMut.mutateAsync(body)} />

      <h4 className="subtitle">Médicament</h4>
      <MedicationForm onSubmit={(body) => createMedicationMut.mutateAsync(body)} />

      {notice && <p role="status" className="notice notice--success">{notice}</p>}

      <h4 className="subtitle">Derniers actes médicaux</h4>
      {isLoading ? (
        <p className="empty">…</p>
      ) : items.length === 0 ? (
        <p className="empty">Aucun acte médical enregistré.</p>
      ) : (
        <ul className="event-list">
          {items.map((e) => (
            <li key={`${e.type}-${e.id}`} className="event-row">
              <span className="grow">
                <span className="event-time">{formatWhen(e.occurredAt)}</span>
                {` · ${ROW[e.type].emoji} ${ROW[e.type].tag}`}
                {rowDetail(e)}
              </span>
              <button
                type="button"
                className="icon-btn icon-btn--edit"
                aria-label={`Modifier ${ROW[e.type].accusative} du ${formatWhen(e.occurredAt)}`}
                title="Modifier"
                onClick={() => setEditing({ type: e.type, item: e })}
              >
                ✏️
              </button>
              <InlineDeleteConfirm
                prompt={ROW[e.type].confirm}
                triggerAriaLabel={`Supprimer ${ROW[e.type].accusative} du ${formatWhen(e.occurredAt)}`}
                onDelete={() => deleteMut.mutateAsync({ type: e.type, id: e.id })}
                onDeleted={() => setNotice(ROW[e.type].deleted)}
              />
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={editing != null}
        title={editing ? <>✏️ Modifier {ROW[editing.type].accusative}</> : null}
        onClose={() => setEditing(null)}
      >
        {editing?.type === 'temperature' && (
          <TemperatureForm
            initial={editing.item}
            onSubmit={(body) => temperatureUpdateMut.mutateAsync({ id: editing.item.id, patch: body })}
          />
        )}
        {editing?.type === 'medication' && (
          <MedicationForm
            initial={editing.item}
            onSubmit={(body) =>
              updateMedicationMut.mutateAsync({ type: 'medication', id: editing.item.id, patch: body })
            }
          />
        )}
      </BottomSheet>
    </>
  )
}

// Libellés FR de la liste, keyés sur le type de PRÉSENTATION (celui que porte chaque ligne).
const ROW = {
  temperature: {
    emoji: '🌡', tag: 'Température', accusative: 'la température',
    confirm: 'Supprimer cette température ?', deleted: 'Température supprimée.',
  },
  medication: {
    emoji: '💊', tag: 'Médicament', accusative: 'le médicament',
    confirm: 'Supprimer ce médicament ?', deleted: 'Médicament supprimé.',
  },
}

// Detail after the tag of a list row: the reading for a temperature, the name [· dosage] for a
// medication.
function rowDetail(e) {
  if (e.type === 'temperature') return ` · ${formatCelsius(e.temperatureCelsiusX10)}`
  if (e.type === 'medication') return ` · ${describeMedication(e)}`
  return ''
}

// Affichage local simple ; le formatage Europe/Paris dédié vit dans le calendrier (Épic 6).
function formatWhen(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
