import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getWeightHistory } from '../api'
import { growthWindow, toChartPoints } from '../weight'
import { WHO_BANDS, buildGrowthData } from '../growth/whoBands'

// Recharts (~430 kB) + les tables OMS ne vivent QUE dans ce chunk lazy (D12-G′) : ce module n'est
// jamais importé par une surface toujours montée (WeightPanel / quick-bar).

const GROWTH_VIEWS = ['all', 'year', 'month']
const GROWTH_VIEW_LABEL = { all: 'Tout', year: 'Année', month: 'Mois' }

const gramsToKg = (g) => `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)} kg`
const monthTick = (m) => `${Math.round(m)} m`

/**
 * Courbe de croissance (US12.1) : bandes de percentiles OMS (poids-pour-âge, du bon sexe) en fond,
 * pesées de l'enfant par-dessus. Axe X = âge en mois (depuis `birthDate`), axe Y = grammes (kg au
 * tick). La vue Croissance ne monte ce composant que quand le gate `birthDate` ET `sex` est passé
 * (garanti par le parent), donc `sex`/`birthDate` sont non nuls ici.
 *
 * Cache `['babies', babyId, 'weight-history']` sous le préfixe `['babies', babyId]` → l'invalidation
 * après saisie/suppression (WeightPanel) rafraîchit aussi la courbe.
 */
export default function WeightChart({ babyId, sex, birthDate }) {
  const [view, setView] = useState('all')
  const { data, isLoading } = useQuery({
    queryKey: ['babies', babyId, 'weight-history'],
    queryFn: () => getWeightHistory(babyId),
  })

  const childPoints = toChartPoints(data, birthDate)
  const latest = childPoints.length ? childPoints[childPoints.length - 1].ageMonths : 0
  const window = growthWindow(view, birthDate, latest)
  const rows = buildGrowthData(sex, childPoints, window)

  return (
    <section className="card">
      <div className="seg" role="tablist" aria-label="Période de croissance">
        {GROWTH_VIEWS.map((v) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            className={`seg-btn ${view === v ? 'seg-btn--active' : ''}`}
            onClick={() => setView(v)}
          >
            {GROWTH_VIEW_LABEL[v]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="empty">…</p>
      ) : childPoints.length === 0 ? (
        <p className="empty">Aucune pesée enregistrée. Ajoutez un poids pour voir la courbe.</p>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={rows} margin={{ top: 6, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              type="number"
              dataKey="ageMonths"
              domain={[window.minMonths, window.maxMonths]}
              tickFormatter={monthTick}
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
            />
            <YAxis
              tickFormatter={gramsToKg}
              tick={{ fontSize: 10, fill: 'var(--muted)' }}
              width={44}
              tickLine={false}
              axisLine={false}
              domain={['dataMin - 500', 'dataMax + 500']}
            />
            <Tooltip
              labelFormatter={monthTick}
              formatter={(value, name) => [gramsToKg(value), name === 'child' ? 'Poids' : name.toUpperCase()]}
              contentStyle={{ borderRadius: 12, border: '1.5px solid var(--border)', fontSize: 12, fontFamily: 'inherit' }}
            />
            {WHO_BANDS.map((band) => (
              <Line
                key={band.key}
                type="monotone"
                dataKey={band.key}
                name={band.key}
                stroke="var(--muted)"
                strokeWidth={band.key === 'p50' ? 1.4 : 0.8}
                strokeDasharray={band.key === 'p50' ? undefined : '4 3'}
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            <Line
              type="monotone"
              dataKey="child"
              name="child"
              stroke="var(--weight-ink, #3f8f6b)"
              strokeWidth={2.5}
              dot={{ r: 3.5 }}
              activeDot={{ r: 5 }}
              connectNulls
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </section>
  )
}
