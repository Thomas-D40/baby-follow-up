import { useState } from 'react'
import { recentCareRows } from '../medicalCare'
import { useUpdateEvent } from '../services/events'
import { useCreateMedicalCareAct, useMedicalCareList } from '../services/medicalCares'
import { useDeleteEvent } from '../useDeleteEvent'
import { InlineDeleteConfirm } from './DeleteConfirm'
import BottomSheet from './BottomSheet'
import MedicalCareForm from './MedicalCareForm'

// "Soins" surface (Épic 22, D22-A/D22-B): eye and nose care, split out of the Médical sheet. Writes
// run with `retry: 0` and PREFIX invalidation `['babies', babyId]` through the service hooks, so the
// list AND the recap refresh.
//
// ⚠️ Rows come from `/medical-cares` and carry `careType: 'eye' | 'nose'`, whereas edit and delete
// routing key on the PRESENTATION types `eye_care` / `nose_care` (K1). `recentCareRows` does the
// translation: a raw `'eye'` would give `DELETE_CLIENT['eye'] === undefined`, hence a TypeError.
export default function CarePanel({ babyId }) {
  const [notice, setNotice] = useState(null)
  const [editing, setEditing] = useState(null) // { type, item } being edited, or null

  const { cares, isLoading } = useMedicalCareList(babyId)
  const createActMut = useCreateMedicalCareAct(babyId, {
    onSuccess: () => setNotice('Soin enregistré.'),
  })
  const updateMut = useUpdateEvent(babyId, {
    onSuccess: () => {
      setEditing(null)
      setNotice('Soin mis à jour.')
    },
  })
  const deleteMut = useDeleteEvent(babyId)

  const rows = recentCareRows(cares)

  return (
    <>
      <MedicalCareForm onSubmit={(body) => createActMut.mutateAsync(body)} />

      {notice && <p role="status" className="notice notice--success">{notice}</p>}

      <h4 className="subtitle">Derniers soins</h4>
      {isLoading ? (
        <p className="empty">…</p>
      ) : rows.length === 0 ? (
        <p className="empty">Aucun soin enregistré.</p>
      ) : (
        <ul className="event-list">
          {rows.map((e) => (
            <li key={`${e.type}-${e.id}`} className="event-row">
              <span className="grow">
                <span className="event-time">{formatWhen(e.occurredAt)}</span>
                {` · ${ROW[e.type].emoji} ${ROW[e.type].tag}`}
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
        {editing && (
          <MedicalCareForm
            initial={editing.item}
            onSubmit={(body) =>
              updateMut.mutateAsync({ type: editing.type, id: editing.item.id, patch: body })
            }
          />
        )}
      </BottomSheet>
    </>
  )
}

// FR labels of the list, keyed on the PRESENTATION type carried by each row.
const ROW = {
  eye_care: {
    emoji: '👁', tag: 'Yeux', accusative: 'le soin des yeux',
    confirm: 'Supprimer ce soin des yeux ?', deleted: 'Soin des yeux supprimé.',
  },
  nose_care: {
    emoji: '👃', tag: 'Nez', accusative: 'le soin du nez',
    confirm: 'Supprimer ce soin du nez ?', deleted: 'Soin du nez supprimé.',
  },
}

// Simple local display; the dedicated Europe/Paris formatting lives in the calendar (Épic 6).
function formatWhen(iso) {
  return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}
