import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDayEvents, getDailyTotals } from '../api'
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
import CalendarEditSheet from './CalendarEditSheet'
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
 * `TemperatureForm`, `MedicalCareForm`, `NapEditForm`) — dans un `BottomSheet` (vue `CalendarEditSheet`). Le DTO calendrier
 * expose un champ unifié `startAt` : les **cinq** forms qui lisent `initial.occurredAt` (biberon,
 * selle, urine, température, soin) reçoivent le remap `occurredAt: editing.startAt` (sinon l'heure
 * retomberait sur « maintenant ») ; `NapEditForm` lit `startAt`/`endAt` → pas d'adaptation. L'édition est masquée sur une sieste en
 * cours (`isOngoing`, non éditable). Succès : invalidation **préfixe** `['babies', babyId]` (DA-4).
 * Le 409 sieste (course : rouverte ailleurs) est affiché clairement par `NapEditForm`.
 *
 * Épic 15 : la température et les deux soins (`eye_care`/`nose_care`, K1) sont des types de récap
 * comme les autres — pastille de récap, tag, emoji, suppression et édition keyent tous sur `type`. Le
 * remap `occurredAt: editing.startAt` vaut aussi pour eux (`TemperatureForm`/`MedicalCareForm`).
 *
 * Epic 16 (D16-A): totals and the per-type filter are a single row; a total chip IS the filter
 * control of its type (`aria-pressed`). Epic 21 (D21-A): only a type present in the day's list gets
 * a chip, and a day with an empty or unavailable list gets no row. When totals are missing, the
 * fallback "no value" is decided per field (D16-Q, D21-D), never on the whole `totals` object.
 */
export default function CalendarPanel({ babyId }) {
  const [date, setDate] = useState(() => parisToday())
  const [toDelete, setToDelete] = useState(null) // { type, id } en attente de confirmation
  const [deleteError, setDeleteError] = useState(false)
  const [editing, setEditing] = useState(null) // l'event en cours d'édition, ou null
  // US13.3 (D13-H) : filtre d'affichage par type sur la SEULE liste chronologique. Multi-sélection,
  // défaut = tout affiché (impératif de lecture). Persistance sessionStorage (PAS localStorage : l'état
  // ne doit pas survivre à la fermeture de l'onglet). Épic 16 : le contrôle vit désormais DANS la
  // rangée de totaux, mais n'affecte toujours ni les valeurs des totaux ni les requêtes.
  const [hidden, setHidden] = useState(loadHiddenTypes) // types masqués (array), [] = tout affiché
  const toggleType = (type) => {
    setHidden((prev) => {
      const next = prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
      try { sessionStorage.setItem(DAY_FILTER_KEY, JSON.stringify(next)) } catch { /* stockage indispo */ }
      return next
    })
  }
  const deleteMut = useDeleteEvent(babyId)

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
  // A chip exists only for a type present in the WHOLE day list, before the filter (D21-A):
  // counting `visibleEvents` would make a switched-off chip vanish with no way back.
  const chipTypes = FILTER_ORDER.filter((type) => events.some((e) => e.type === type))
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

      {/* Single row (D16-A): one clickable chip per type, which switches that type off in the list
          below. The chips come from the day's event list, never from `totals` (D21-A): a
          `daily-totals` outage removes neither a chip nor the filter, the present types then show
          their emoji alone (D16-J, D21-D). No present type means no row at all, so no empty named
          list is announced (D21-C, D21-E, D21-M). 🌡 follows the common rule; its value is the
          day's MAXIMUM, never a count, and a null maximum shows no value, not 0 nor a dash
          (D15-K, D21-F). */}
      {chipTypes.length > 0 && (
        <ul className="chips" aria-label="Totaux du jour — filtrer la liste">
          {chipTypes.map((type) => {
            const value = totals ? CHIP_VALUE[type](totals) : null
            // L'état (allumé/éteint) est porté par `aria-pressed` SEUL : le répéter ici le ferait
            // annoncer deux fois par un lecteur d'écran (D16-K).
            const label = value
              ? `${EVENT_TYPE_LABEL[type]} · ${value.strong}${value.suffix}`
              : EVENT_TYPE_LABEL[type]
            return (
              <li key={type}>
                <button
                  type="button"
                  className={`chip chip--${TAG_CLASS[type]} chip--toggle`}
                  onClick={() => toggleType(type)}
                  aria-pressed={!hidden.includes(type)}
                  aria-label={label}
                >
                  {EVENT_EMOJI[type]}
                  {value && <>{' '}<strong>{value.strong}</strong>{value.suffix}</>}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <VitaminSection babyId={babyId} date={date} />

      {eventsQuery.isLoading ? (
        <p className="empty">…</p>
      ) : events.length === 0 ? (
        <p className="empty">Aucun événement ce jour-là.</p>
      ) : visibleEvents.length === 0 ? (
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

      <CalendarEditSheet babyId={babyId} editing={editing} onClose={() => setEditing(null)} />

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
  bottle_feeding: 'milk', breastfeeding: 'breast', solid_meal: 'meal', nap: 'sleep', stool: 'stool', urine: 'urine',
  temperature: 'temperature', eye_care: 'eye-care', nose_care: 'nose-care', medication: 'medication',
}
const EVENT_EMOJI = {
  bottle_feeding: '🍼', breastfeeding: '🤱', solid_meal: '🥄', nap: '😴', stool: '💩', urine: '💧',
  temperature: '🌡', eye_care: '👁', nose_care: '👃', medication: '💊',
}

// How each chip renders its total (Épic 16, D16-U): `{ strong, suffix }`, where `strong` is the only
// part wrapped in <strong> (that is the node `.chip strong` styles, and the one that carries the
// contrast of the off state, D16-R). Presentation mapping, deliberately kept next to TAG_CLASS and
// EVENT_EMOJI rather than extracted into a pure module.
// D16-Q: the fallback is decided PER FIELD, never on the `totals` object — an older payload missing
// one field must yield an emoji-only chip, not « Urine · undefined urine » nor « NaN min ».
// The guard is `!= null`, never falsy: 0 ml, 0 stool and 0.0 °C are transmitted values that show up.
const CHIP_VALUE = {
  bottle_feeding: (t) => (t.totalMilkMl != null ? { strong: t.totalMilkMl, suffix: ' ml' } : null),
  breastfeeding: (t) => (t.breastfeedingCount != null ? { strong: t.breastfeedingCount, suffix: ` tétée${t.breastfeedingCount > 1 ? 's' : ''}` } : null),
  solid_meal: (t) => (t.solidMealCount != null ? { strong: t.solidMealCount, suffix: ' repas' } : null),
  nap: (t) => (t.totalSleepMinutes != null ? { strong: formatSleepTotal(t.totalSleepMinutes), suffix: '' } : null),
  stool: (t) => (t.stoolCount != null ? { strong: t.stoolCount, suffix: ` selle${t.stoolCount > 1 ? 's' : ''}` } : null),
  urine: (t) => (t.urineCount != null ? { strong: t.urineCount, suffix: ` urine${t.urineCount > 1 ? 's' : ''}` } : null),
  temperature: (t) => (t.maxTemperatureCelsiusX10 != null ? { strong: formatCelsius(t.maxTemperatureCelsiusX10), suffix: '' } : null),
  eye_care: (t) => (t.eyeCareCount != null ? { strong: t.eyeCareCount, suffix: ` soin${t.eyeCareCount > 1 ? 's' : ''} des yeux` } : null),
  nose_care: (t) => (t.noseCareCount != null ? { strong: t.noseCareCount, suffix: ` soin${t.noseCareCount > 1 ? 's' : ''} du nez` } : null),
  medication: (t) => (t.medicationCount != null ? { strong: t.medicationCount, suffix: ` prise${t.medicationCount > 1 ? 's' : ''}` } : null),
}

// US13.3 : ordre d'affichage des toggles du filtre (calé sur les chips totaux) et clé de persistance.
// Un toggle par type de soin (D15-I) : c'est la condition de viabilité du modèle — une journée à
// ~8 lavages de nez noierait la frise sans un filtre qui masque VRAIMENT ce type-là.
const FILTER_ORDER = ['bottle_feeding', 'breastfeeding', 'solid_meal', 'nap', 'stool', 'urine', 'temperature', 'eye_care', 'nose_care', 'medication']
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
