import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getDayEvents,
  getDailyTotals,
  updateBottleFeeding,
  updateMedicalCare,
  updateNap,
  updateStool,
  updateTemperature,
  updateUrine,
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
import { formatCelsius } from '../temperature'
import { useDeleteEvent } from '../useDeleteEvent'
import { ConfirmDeleteModal } from './DeleteConfirm'
import BottomSheet from './BottomSheet'
import BottleFeedingForm from './BottleFeedingForm'
import MedicalCareForm from './MedicalCareForm'
import StoolForm from './StoolForm'
import TemperatureForm from './TemperatureForm'
import UrineForm from './UrineForm'
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
 * panels — ils sont **six** depuis l'Épic 15 (`BottleFeedingForm`, `StoolForm`, `UrineForm`,
 * `TemperatureForm`, `MedicalCareForm`, `NapEditForm`) — dans un `BottomSheet`. Le DTO calendrier
 * expose un champ unifié `startAt` : les **cinq** forms qui lisent `initial.occurredAt` (biberon,
 * selle, urine, température, soin) reçoivent le remap `occurredAt: editing.startAt` (sinon l'heure
 * retomberait sur « maintenant ») ; `NapEditForm` lit `startAt`/`endAt` → pas d'adaptation. L'édition est masquée sur une sieste en
 * cours (`isOngoing`, non éditable). Succès : invalidation **préfixe** `['babies', babyId]` (DA-4).
 * Le 409 sieste (course : rouverte ailleurs) est affiché clairement par `NapEditForm`.
 *
 * Épic 15 : la température et les deux soins (`eye_care`/`nose_care`, K1) sont des types de récap
 * comme les autres — chips, tag, emoji, filtre, suppression et édition keyent tous sur `type`. Le
 * remap `occurredAt: editing.startAt` vaut aussi pour eux (`TemperatureForm`/`MedicalCareForm`).
 */
export default function CalendarPanel({ babyId }) {
  const qc = useQueryClient()
  const [date, setDate] = useState(() => parisToday())
  const [toDelete, setToDelete] = useState(null) // { type, id } en attente de confirmation
  const [deleteError, setDeleteError] = useState(false)
  const [editing, setEditing] = useState(null) // l'event en cours d'édition, ou null
  // US13.3 (D13-H) : filtre d'affichage par type sur la SEULE liste chronologique. Multi-sélection,
  // défaut = tout affiché (impératif de lecture). Persistance sessionStorage (PAS localStorage : l'état
  // ne doit pas survivre à la fermeture de l'onglet). N'affecte ni les chips totaux ni les requêtes.
  const [hidden, setHidden] = useState(loadHiddenTypes) // types masqués (array), [] = tout affiché
  const toggleType = (type) => {
    setHidden((prev) => {
      const next = prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
      try { sessionStorage.setItem(DAY_FILTER_KEY, JSON.stringify(next)) } catch { /* stockage indispo */ }
      return next
    })
  }
  const deleteMut = useDeleteEvent(babyId)

  // Six mutations d'édition calquées sur les panels (retry: 0, invalidation préfixe DA-4). Le
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
  const urineUpdateMut = useMutation({
    mutationFn: ({ id, patch }) => updateUrine(babyId, id, patch),
    retry: 0,
    onSuccess: editSuccess,
  })
  const napUpdateMut = useMutation({
    mutationFn: ({ id, patch }) => updateNap(babyId, id, patch),
    retry: 0,
    onSuccess: editSuccess,
  })
  const temperatureUpdateMut = useMutation({
    mutationFn: ({ id, patch }) => updateTemperature(babyId, id, patch),
    retry: 0,
    onSuccess: editSuccess,
  })
  // Une seule mutation pour les DEUX types de soin : deux types de présentation, une ressource (K1).
  const careUpdateMut = useMutation({
    mutationFn: ({ id, patch }) => updateMedicalCare(babyId, id, patch),
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
  const visibleEvents = events.filter((e) => !hidden.includes(e.type)) // prédicat d'affichage (US13.3)
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
          <li className="chip chip--urine">💧 <strong>{totals.urineCount}</strong> urine{totals.urineCount > 1 ? 's' : ''}</li>
          {/* Chip 🌡 = MAXIMUM du jour, jamais un comptage (D15-K). `null` ⇒ AUCUNE mesure ce
              jour-là : on ne rend rien du tout — ni 0, ni tiret. Le test `!= null` couvre aussi
              l'`undefined` d'un totaux plus ancien. */}
          {totals.maxTemperatureCelsiusX10 != null && (
            <li className="chip chip--temperature">🌡 <strong>{formatCelsius(totals.maxTemperatureCelsiusX10)}</strong></li>
          )}
          <li className="chip chip--eye-care">👁 <strong>{totals.eyeCareCount}</strong> soin{totals.eyeCareCount > 1 ? 's' : ''} des yeux</li>
          <li className="chip chip--nose-care">👃 <strong>{totals.noseCareCount}</strong> soin{totals.noseCareCount > 1 ? 's' : ''} du nez</li>
        </ul>
      )}

      <VitaminSection babyId={babyId} date={date} />

      {eventsQuery.isLoading ? (
        <p className="empty">…</p>
      ) : events.length === 0 ? (
        <p className="empty">Aucun événement ce jour-là.</p>
      ) : (
        <>
          <div className="day-filter" role="group" aria-label="Filtrer la liste par type">
            {FILTER_ORDER.map((type) => {
              const on = !hidden.includes(type)
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  aria-pressed={on}
                  className={`filter-chip filter-chip--${TAG_CLASS[type]}`}
                >
                  {EVENT_EMOJI[type]} {EVENT_TYPE_LABEL[type]}
                </button>
              )
            })}
          </div>
          {visibleEvents.length === 0 ? (
            <p className="empty">Aucun événement pour les types affichés.</p>
          ) : (
            <ul className="event-list">
              {visibleEvents.map((e) => (
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
        </>
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
        {editing?.type === 'urine' && (
          <UrineForm
            initial={{ ...editing, occurredAt: editing.startAt }}
            onSubmit={(body) => urineUpdateMut.mutateAsync({ id: editing.id, patch: body })}
          />
        )}
        {editing?.type === 'nap' && (
          <NapEditForm
            initial={editing}
            onSubmit={(patch) => napUpdateMut.mutateAsync({ id: editing.id, patch })}
          />
        )}
        {editing?.type === 'temperature' && (
          <TemperatureForm
            initial={{ ...editing, occurredAt: editing.startAt }}
            onSubmit={(body) => temperatureUpdateMut.mutateAsync({ id: editing.id, patch: body })}
          />
        )}
        {/* Une condition à DEUX termes, un seul form : les deux types de soin partagent la
            ressource `medical_care` (K1). Le form dérive de `editing.type` le libellé affiché ; le
            type lui-même n'est pas modifiable ici, donc il ne part pas dans le PATCH. */}
        {(editing?.type === 'eye_care' || editing?.type === 'nose_care') && (
          <MedicalCareForm
            initial={{ ...editing, occurredAt: editing.startAt }}
            onSubmit={(body) => careUpdateMut.mutateAsync({ id: editing.id, patch: body })}
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

const TAG_CLASS = {
  bottle_feeding: 'milk', nap: 'sleep', stool: 'stool', urine: 'urine',
  temperature: 'temperature', eye_care: 'eye-care', nose_care: 'nose-care',
}
const EVENT_EMOJI = {
  bottle_feeding: '🍼', nap: '😴', stool: '💩', urine: '💧',
  temperature: '🌡', eye_care: '👁', nose_care: '👃',
}

// US13.3 : ordre d'affichage des toggles du filtre (calé sur les chips totaux) et clé de persistance.
// Un toggle par type de soin (D15-I) : c'est la condition de viabilité du modèle — une journée à
// ~8 lavages de nez noierait la frise sans un filtre qui masque VRAIMENT ce type-là.
const FILTER_ORDER = ['bottle_feeding', 'nap', 'stool', 'urine', 'temperature', 'eye_care', 'nose_care']
const DAY_FILTER_KEY = 'calendar.dayFilter'

// État initial du filtre depuis sessionStorage. Rien de stocké → [] (tout affiché, défaut de lecture).
// On ne garde que des types connus : une valeur corrompue retombe donc silencieusement sur « tout affiché ».
function loadHiddenTypes() {
  try {
    const raw = sessionStorage.getItem(DAY_FILTER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((t) => FILTER_ORDER.includes(t)) : []
  } catch {
    return []
  }
}
