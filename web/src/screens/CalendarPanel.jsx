import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getDayEvents,
  getDailyTotals,
  updateBottleFeeding,
  updateNap,
  updateStool,
} from '../api'
import {
  EVENT_TYPE_LABEL,
  describeEvent,
  formatDayLabel,
  formatParisTime,
  formatSleepTotal,
  isLongNap,
  isOngoing,
  parisToday,
  shiftDate,
} from '../calendar'
import { useDeleteEvent } from '../useDeleteEvent'
import { ConfirmDeleteModal } from './DeleteConfirm'
import BottomSheet from './BottomSheet'
import BottleFeedingForm from './BottleFeedingForm'
import StoolForm from './StoolForm'
import NapEditForm from './NapEditForm'
import VitaminSection from './VitaminSection'

/**
 * Vue calendrier d'un jour (US6.1 liste + US6.3 totaux). Réutilise les endpoints `GET /events` et
 * `GET /daily-totals`. Tout l'affichage est pinné Europe/Paris (D6-D) — le rendu front et le bucketing
 * serveur coïncident. Navigation jour −/+ et bouton « aujourd'hui ». La sieste en cours s'affiche
 * « en cours » (D6-G), une sieste > 10 h est signalée (flag, non bloquant).
 *
 * Épic 7 (D7-E) : possède l'intégration de la **suppression depuis le calendrier**. Chaque ligne porte
 * déjà `{ type, id }` (D6-H) → action « Supprimer » par ligne, **confirmée par modale** (forme adaptée
 * à la liste dense, D7-B), branchée sur le hook mutualisé `useDeleteEvent`. L'invalidation **préfixe**
 * `['babies', babyId]` (D7-C) rafraîchit en un appel la liste **et** les totaux du jour (R1).
 *
 * US11.2 : **édition en place** depuis le récap. Un bouton ✏️ par ligne rouvre le MÊME form que les
 * panels (`BottleFeedingForm`/`StoolForm`/`NapEditForm`) dans un `BottomSheet`. Le DTO calendrier
 * expose un champ unifié `startAt` : biberon/selle lisant `initial.occurredAt`, on mappe
 * `occurredAt: editing.startAt` pour ces deux types (sinon l'heure retomberait sur « maintenant ») ;
 * `NapEditForm` lit `startAt`/`endAt` → pas d'adaptation. L'édition est masquée sur une sieste en
 * cours (`isOngoing`, non éditable). Succès : invalidation **préfixe** `['babies', babyId]` (DA-4).
 * Le 409 sieste (course : rouverte ailleurs) est affiché clairement par `NapEditForm`.
 */
export default function CalendarPanel({ babyId }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(() => parisToday())
  const [toDelete, setToDelete] = useState(null) // { type, id } en attente de confirmation
  const [deleteError, setDeleteError] = useState(false)
  const [editing, setEditing] = useState(null) // l'event en cours d'édition, ou null
  const deleteMut = useDeleteEvent(babyId)

  // Trois mutations d'édition calquées sur les panels (retry: 0, invalidation préfixe DA-4). Le
  // BottomSheet se ferme au succès ; l'échec (dont 409 sieste) est rendu par le form lui-même.
  const editSuccess = () => {
    qc.invalidateQueries({ queryKey: ['babies', babyId] })
    setEditing(null)
  }
  const bottleUpdateMut = useMutation({
    mutationFn: ({ id, patch }) => updateBottleFeeding(babyId, id, patch),
    retry: 0,
    onSuccess: editSuccess,
  })
  const stoolUpdateMut = useMutation({
    mutationFn: ({ id, patch }) => updateStool(babyId, id, patch),
    retry: 0,
    onSuccess: editSuccess,
  })
  const napUpdateMut = useMutation({
    mutationFn: ({ id, patch }) => updateNap(babyId, id, patch),
    retry: 0,
    onSuccess: editSuccess,
  })

  const eventsQuery = useQuery({
    queryKey: ['babies', babyId, 'events', date],
    queryFn: () => getDayEvents(babyId, date),
  })
  const totalsQuery = useQuery({
    queryKey: ['babies', babyId, 'daily-totals', date],
    queryFn: () => getDailyTotals(babyId, date),
  })

  const events = eventsQuery.data ?? []
  const totals = totalsQuery.data
  const isToday = date === parisToday()

  const askDelete = (e) => { setDeleteError(false); setToDelete({ type: e.type, id: e.id }) }
  const cancelDelete = () => { setDeleteError(false); setToDelete(null) }
  const confirmDelete = async () => {
    setDeleteError(false)
    try {
      await deleteMut.mutateAsync(toDelete) // 404 = succès idempotent (D7-C)
      setToDelete(null)
    } catch {
      setDeleteError(true) // 401/403/500 (R3)
    }
  }

  return (
    <section className="card">
      <nav className="daynav">
        <button onClick={() => setDate(shiftDate(date, -1))} className="daynav-btn" aria-label="Jour précédent">‹</button>
        <span className="daynav-label">{isToday ? "Aujourd'hui" : formatDayLabel(date)}</span>
        <button onClick={() => setDate(shiftDate(date, 1))} className="daynav-btn" aria-label="Jour suivant">›</button>
      </nav>
      {!isToday && (
        <button onClick={() => setDate(parisToday())} className="linkbtn" style={{ alignSelf: 'center' }}>
          Revenir à aujourd'hui
        </button>
      )}

      {totals && (
        <ul className="chips">
          <li className="chip chip--milk">🍼 <strong>{totals.totalMilkMl}</strong> ml</li>
          <li className="chip chip--sleep">😴 <strong>{formatSleepTotal(totals.totalSleepMinutes)}</strong></li>
          <li className="chip chip--stool">💩 <strong>{totals.stoolCount}</strong> selle{totals.stoolCount > 1 ? 's' : ''}</li>
        </ul>
      )}

      <VitaminSection babyId={babyId} date={date} />

      {eventsQuery.isLoading ? (
        <p className="empty">…</p>
      ) : events.length === 0 ? (
        <p className="empty">Aucun événement ce jour-là.</p>
      ) : (
        <ul className="event-list">
          {events.map((e) => (
            <li key={`${e.type}-${e.id}`} className="event-row">
              <span className="event-time">{formatParisTime(e.startAt)}</span>
              <span className={`event-tag event-tag--${TAG_CLASS[e.type]}`}>{EVENT_EMOJI[e.type]} {EVENT_TYPE_LABEL[e.type]}</span>
              <span className="event-detail grow">
                {describeEvent(e)}
                {isLongNap(e) && <span className="flag" title="Sieste de plus de 10 h"> ⚠ longue</span>}
              </span>
              {/* Édition masquée sur une sieste en cours (non éditable, se termine via « Fin de sieste »). */}
              {!isOngoing(e) && (
                <button
                  onClick={() => setEditing(e)}
                  className="icon-btn icon-btn--edit"
                  title="Modifier"
                  aria-label={`Modifier ${EVENT_TYPE_LABEL[e.type].toLowerCase()} de ${formatParisTime(e.startAt)}`}
                >
                  ✏️
                </button>
              )}
              <button
                onClick={() => askDelete(e)}
                className="icon-btn"
                title="Supprimer"
                aria-label={`Supprimer ${EVENT_TYPE_LABEL[e.type].toLowerCase()} de ${formatParisTime(e.startAt)}`}
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}

      <BottomSheet
        open={editing != null}
        title={editing ? <>✏️ Modifier {EVENT_TYPE_LABEL[editing.type].toLowerCase()}</> : null}
        onClose={() => setEditing(null)}
      >
        {editing?.type === 'bottle_feeding' && (
          <BottleFeedingForm
            initial={{ ...editing, occurredAt: editing.startAt }}
            onSubmit={(body) => bottleUpdateMut.mutateAsync({ id: editing.id, patch: body })}
          />
        )}
        {editing?.type === 'stool' && (
          <StoolForm
            initial={{ ...editing, occurredAt: editing.startAt }}
            onSubmit={(body) => stoolUpdateMut.mutateAsync({ id: editing.id, patch: body })}
          />
        )}
        {editing?.type === 'nap' && (
          <NapEditForm
            initial={editing}
            onSubmit={(patch) => napUpdateMut.mutateAsync({ id: editing.id, patch })}
          />
        )}
      </BottomSheet>

      {toDelete && (
        <ConfirmDeleteModal
          prompt="Supprimer cet événement ?"
          pending={deleteMut.isPending}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </section>
  )
}

const TAG_CLASS = { bottle_feeding: 'milk', nap: 'sleep', stool: 'stool' }
const EVENT_EMOJI = { bottle_feeding: '🍼', nap: '😴', stool: '💩' }
