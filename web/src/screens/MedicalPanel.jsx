import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createMedicalCareAct,
  createTemperature,
  listMedicalCares,
  listTemperatures,
  updateMedicalCare,
  updateTemperature,
} from '../api'
import { careEventType } from '../medicalCare'
import { describeMedication } from '../medication'
import { useUpdateEvent } from '../services/events'
import { useCreateMedication, useMedicationList } from '../services/medications'
import { formatCelsius } from '../temperature'
import { useDeleteEvent } from '../useDeleteEvent'
import { InlineDeleteConfirm } from './DeleteConfirm'
import BottomSheet from './BottomSheet'
import MedicalCareForm from './MedicalCareForm'
import MedicationForm from './MedicationForm'
import TemperatureForm from './TemperatureForm'

// Display cap PER TYPE, deliberately NOT `slice(0, 10)` on the merged list like DiaperChangePanel.
// A nominal day carries ~8 nose washes: capping the MERGE would evict every temperature from the
// very list where it was just entered (fever + cold on the same day is the use case of this epic).
// 5 + 5 costs ~4 lines and zero extra request — the two lists are already fetched separately.
// Display cap only: the recap chips and the day timeline never rely on it.
const RECENT_PER_TYPE = 5

/**
 * "Medical" surface (US15.1/US15.2, D15-L; US19.1): one sheet for every entry — temperature, eye
 * care, nose care, medication — plus the "Derniers actes médicaux" list. `DiaperChangePanel` pattern:
 * writes run with `retry: 0` (no automatic replay that would duplicate on a lost response) and the
 * PREFIX invalidation `['babies', babyId]` on success refreshes the local list AND the recap
 * (events + daily-totals), which derive from the same events.
 *
 * ⚠️ La liste fusionne deux ressources dont les vocabulaires diffèrent : les items de
 * `/medical-cares` portent `careType: 'eye' | 'nose'`, alors que le routage d'édition et de
 * suppression (`useDeleteEvent`, `MedicalCareForm`) key sur les types de **présentation**
 * `eye_care` / `nose_care` (K1). La traduction est explicite via `careEventType` : poser
 * `type: 'eye'` par mimétisme avec `DiaperChangePanel` donnerait `DELETE_CLIENT['eye'] ===
 * undefined`, donc un TypeError à la première suppression.
 */
export default function MedicalPanel({ babyId }) {
  const qc = useQueryClient()
  const [notice, setNotice] = useState(null)
  const [editing, setEditing] = useState(null) // { type, item } en cours d'édition, ou null

  const temperaturesQuery = useQuery({
    queryKey: ['babies', babyId, 'temperatures'],
    queryFn: () => listTemperatures(babyId),
  })
  const caresQuery = useQuery({
    queryKey: ['babies', babyId, 'medical-cares'],
    queryFn: () => listMedicalCares(babyId),
  })

  const createTemperatureMut = useMutation({
    mutationFn: (body) => createTemperature(babyId, body),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      setNotice('Température enregistrée.')
    },
  })
  const createCareActMut = useMutation({
    mutationFn: (body) => createMedicalCareAct(babyId, body),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      setNotice('Soin enregistré.')
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
  const careUpdateMut = useMutation({
    mutationFn: ({ id, patch }) => updateMedicalCare(babyId, id, patch),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      setEditing(null)
      setNotice('Soin mis à jour.')
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

  const isLoading = temperaturesQuery.isLoading || caresQuery.isLoading || medicationsLoading
  const items = [
    ...(temperaturesQuery.data?.items ?? []).slice(0, RECENT_PER_TYPE).map((t) => ({ ...t, type: 'temperature' })),
    ...(caresQuery.data?.items ?? []).slice(0, RECENT_PER_TYPE).map((c) => ({ ...c, type: careEventType(c.careType) })),
    ...medications.slice(0, RECENT_PER_TYPE).map((m) => ({ ...m, type: 'medication' })),
  ].sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))

  return (
    <>
      <h4 className="subtitle">Température</h4>
      <TemperatureForm onSubmit={(body) => createTemperatureMut.mutateAsync(body)} />

      <h4 className="subtitle">Soin des yeux / du nez</h4>
      <MedicalCareForm onSubmit={(body) => createCareActMut.mutateAsync(body)} />

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
        {(editing?.type === 'eye_care' || editing?.type === 'nose_care') && (
          <MedicalCareForm
            initial={editing.item}
            onSubmit={(body) => careUpdateMut.mutateAsync({ id: editing.item.id, patch: body })}
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
  eye_care: {
    emoji: '👁', tag: 'Yeux', accusative: 'le soin des yeux',
    confirm: 'Supprimer ce soin des yeux ?', deleted: 'Soin des yeux supprimé.',
  },
  nose_care: {
    emoji: '👃', tag: 'Nez', accusative: 'le soin du nez',
    confirm: 'Supprimer ce soin du nez ?', deleted: 'Soin du nez supprimé.',
  },
  medication: {
    emoji: '💊', tag: 'Médicament', accusative: 'le médicament',
    confirm: 'Supprimer ce médicament ?', deleted: 'Médicament supprimé.',
  },
}

// Detail after the tag of a list row: the reading for a temperature, the name [· dosage] for a
// medication, nothing for a care.
function rowDetail(e) {
  if (e.type === 'temperature') return ` · ${formatCelsius(e.temperatureCelsiusX10)}`
  if (e.type === 'medication') return ` · ${describeMedication(e)}`
  return ''
}

// Affichage local simple ; le formatage Europe/Paris dédié vit dans le calendrier (Épic 6).
function formatWhen(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
