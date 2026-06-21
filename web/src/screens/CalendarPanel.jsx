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
  parisToday,
  shiftDate,
} from '../calendar'

/**
 * Vue calendrier d'un jour (US6.1 liste + US6.3 totaux). Lecture seule : réutilise les endpoints
 * `GET /events` et `GET /daily-totals`. Tout l'affichage est pinné Europe/Paris (D6-D) — le rendu
 * front et le bucketing serveur coïncident. Navigation jour −/+ et bouton « aujourd'hui ». La sieste
 * en cours s'affiche « en cours » (D6-G), une sieste > 10 h est signalée (flag, non bloquant).
 */
export default function CalendarPanel({ babyId }) {
  const [date, setDate] = useState(() => parisToday())

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

  return (
    <section style={styles.card}>
      <h3 style={{ margin: 0 }}>Journée</h3>

      <nav style={styles.nav}>
        <button onClick={() => setDate(shiftDate(date, -1))} style={styles.navBtn} aria-label="Jour précédent">‹</button>
        <span style={styles.day}>{formatDayLabel(date)}</span>
        <button onClick={() => setDate(shiftDate(date, 1))} style={styles.navBtn} aria-label="Jour suivant">›</button>
        {!isToday && (
          <button onClick={() => setDate(parisToday())} style={styles.today}>Aujourd'hui</button>
        )}
      </nav>

      {totals && (
        <ul style={styles.totals}>
          <li><strong>{totals.totalMilkMl}</strong> ml de lait</li>
          <li><strong>{formatSleepTotal(totals.totalSleepMinutes)}</strong> de sommeil</li>
          <li><strong>{totals.stoolCount}</strong> selle{totals.stoolCount > 1 ? 's' : ''}</li>
        </ul>
      )}

      {eventsQuery.isLoading ? (
        <p style={styles.muted}>…</p>
      ) : events.length === 0 ? (
        <p style={styles.muted}>Aucun événement ce jour-là.</p>
      ) : (
        <ul style={styles.list}>
          {events.map((e) => (
            <li key={`${e.type}-${e.id}`} style={styles.item}>
              <span style={styles.time}>{formatParisTime(e.startAt)}</span>
              <span style={styles.type}>{EVENT_TYPE_LABEL[e.type]}</span>
              <span style={styles.detail}>
                {describeEvent(e)}
                {isLongNap(e) && <span style={styles.flag} title="Sieste de plus de 10 h"> ⚠ longue</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const styles = {
  card: { border: '1px solid #eee', borderRadius: 10, padding: '1.2rem', display: 'flex', flexDirection: 'column', gap: '.8rem', marginTop: '1rem' },
  nav: { display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap' },
  navBtn: { padding: '.2rem .6rem', fontSize: '1.1rem', borderRadius: 6, border: '1px solid #ccc', background: '#fff', cursor: 'pointer', lineHeight: 1 },
  day: { fontSize: '.95rem', textTransform: 'capitalize' },
  today: { background: 'none', border: 0, color: '#3b82f6', cursor: 'pointer', padding: 0, font: 'inherit' },
  totals: { listStyle: 'none', padding: '.6rem .8rem', margin: 0, display: 'flex', flexWrap: 'wrap', gap: '1rem', background: '#f8fafc', borderRadius: 8, fontSize: '.9rem' },
  muted: { color: '#888', margin: 0 },
  list: { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '.4rem' },
  item: { display: 'flex', alignItems: 'baseline', gap: '.6rem', fontSize: '.9rem' },
  time: { fontVariantNumeric: 'tabular-nums', color: '#444', minWidth: '3rem' },
  type: { fontWeight: 600, minWidth: '4.5rem' },
  detail: { color: '#555' },
  flag: { color: '#b45309' },
}
