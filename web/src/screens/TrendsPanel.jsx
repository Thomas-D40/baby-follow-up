import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getTotalsSeries } from '../api'
import { parisToday } from '../calendar'
import {
  TREND_METRICS,
  formatPeriodLabel,
  periodRange,
  samePeriod,
  shiftPeriod,
  toChartRows,
} from '../series'

/**
 * Vue tendances (calendrier élargi) : courbes du lait, du sommeil et des selles sur une période
 * semaine / mois / année. Réutilise l'endpoint d'agrégation `GET /totals-series` (buckets Paris,
 * clipping sieste par bucket comme les totaux quotidiens). `view` ∈ {week, month, year} est piloté
 * par le sélecteur de `BabiesScreen` ; la navigation période −/+ reste interne au panneau.
 *
 * La clé de cache `['babies', babyId, 'totals-series', …]` est sous le préfixe `['babies', babyId]`
 * → l'invalidation après suppression (D7-C) rafraîchit aussi les courbes.
 */
export default function TrendsPanel({ babyId, view }) {
  const [anchor, setAnchor] = useState(() => parisToday())
  const { from, to, bucket } = periodRange(view, anchor)
  const isCurrent = samePeriod(view, anchor, parisToday())

  const query = useQuery({
    queryKey: ['babies', babyId, 'totals-series', bucket, from, to],
    queryFn: () => getTotalsSeries(babyId, { from, to, bucket }),
  })

  const points = query.data?.points ?? []
  const rows = toChartRows(points, bucket)
  const hasData = points.some((p) => p.totalMilkMl || p.totalSleepMinutes || p.stoolCount)

  return (
    <section className="card">
      <nav className="daynav">
        <button onClick={() => setAnchor(shiftPeriod(view, anchor, -1))} className="daynav-btn" aria-label="Période précédente">‹</button>
        <span className="daynav-label">{formatPeriodLabel(view, anchor)}</span>
        <button onClick={() => setAnchor(shiftPeriod(view, anchor, 1))} className="daynav-btn" aria-label="Période suivante">›</button>
      </nav>
      {!isCurrent && (
        <button onClick={() => setAnchor(parisToday())} className="linkbtn" style={{ alignSelf: 'center' }}>
          Revenir à aujourd'hui
        </button>
      )}

      {query.isLoading ? (
        <p className="empty">…</p>
      ) : !hasData ? (
        <p className="empty">Aucune donnée sur cette période.</p>
      ) : (
        <div className="trend-grid">
          {TREND_METRICS.map((m) => (
            <div className="trend-chart" key={m.key}>
              <h3 className="trend-title"><span aria-hidden="true">{m.emoji}</span> {m.label}</h3>
              <ResponsiveContainer width="100%" height={150}>
                <LineChart data={rows} margin={{ top: 6, right: 10, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} interval="preserveStartEnd" tickLine={false} axisLine={{ stroke: 'var(--border)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--muted)' }} allowDecimals={false} width={30} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value) => [m.format(value), m.label]}
                    contentStyle={{ borderRadius: 12, border: '1.5px solid var(--border)', fontSize: 12, fontFamily: 'inherit' }}
                  />
                  <Line type="monotone" dataKey={m.key} stroke={m.color} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
