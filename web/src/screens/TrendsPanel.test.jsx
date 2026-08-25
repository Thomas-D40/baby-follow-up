import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TrendsPanel from './TrendsPanel'
import { parisToday, shiftDate } from '../calendar'
import { periodRange } from '../series'

vi.mock('../api', () => ({ getTotalsSeries: vi.fn() }))
import { getTotalsSeries } from '../api'

function renderPanel(view = 'week') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><TrendsPanel babyId="b1" view={view} /></QueryClientProvider>,
  )
}

/** Bornes attendues pour la vue, dérivées de l'ancre du jour — jamais écrites en dur. */
function expectedRange(view) {
  const { from, to } = periodRange(view, parisToday())
  return { from, to }
}

const SERIES = {
  from: '2026-06-15',
  to: '2026-06-21',
  points: [
    { date: '2026-06-15', totalMilkMl: 360, totalSleepMinutes: 600, stoolCount: 2 },
    { date: '2026-06-16', totalMilkMl: 420, totalSleepMinutes: 540, stoolCount: 1 },
  ],
}

describe('TrendsPanel — vue tendances (courbes)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche les 3 courbes quand il y a des données', async () => {
    getTotalsSeries.mockResolvedValue(SERIES)
    renderPanel('week')

    expect(await screen.findByRole('heading', { name: /Lait/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Sommeil/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Selles/ })).toBeInTheDocument()
  })

  it('affiche un état vide quand tous les agrégats sont à zéro', async () => {
    getTotalsSeries.mockResolvedValue({
      from: '2026-06-15', to: '2026-06-21',
      points: [{ date: '2026-06-15', totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0 }],
    })
    renderPanel('week')

    expect(await screen.findByText(/Aucune donnée sur cette période/)).toBeInTheDocument()
  })

  // ⚠️ Aucune borne en dur dans ces cas : le panneau s'ancre sur `parisToday()`, une date littérale
  // les ferait rougir au prochain changement de semaine/mois/année. Les attendus sont dérivés.
  it('la vue Semaine demande le lundi→dimanche de l’ancre du jour', async () => {
    getTotalsSeries.mockResolvedValue(SERIES)
    renderPanel('week')

    await waitFor(() => expect(getTotalsSeries).toHaveBeenCalled())
    expect(getTotalsSeries.mock.calls[0][0]).toBe('b1')
    const { from, to } = getTotalsSeries.mock.calls[0][1]
    expect({ from, to }).toEqual(expectedRange('week'))
    expect(new Date(`${from}T00:00:00Z`).getUTCDay()).toBe(1) // lundi ISO
    expect(shiftDate(from, 6)).toBe(to) // 7 jours inclus
  })

  it('la vue Mois demande le 1ᵉʳ→dernier jour du mois de l’ancre', async () => {
    getTotalsSeries.mockResolvedValue(SERIES)
    renderPanel('month')

    await waitFor(() => expect(getTotalsSeries).toHaveBeenCalled())
    const { from, to } = getTotalsSeries.mock.calls[0][1]
    expect({ from, to }).toEqual(expectedRange('month'))
    expect(from.endsWith('-01')).toBe(true)
    expect(shiftDate(to, 1).endsWith('-01')).toBe(true) // `to` = dernier jour du mois
  })

  it('la navigation période change la plage demandée', async () => {
    getTotalsSeries.mockResolvedValue(SERIES)
    renderPanel('week')
    await screen.findByRole('heading', { name: /Lait/ })

    await userEvent.click(screen.getByRole('button', { name: 'Période précédente' }))

    await waitFor(() => expect(getTotalsSeries).toHaveBeenCalledTimes(2))
    // 2ᵉ appel : semaine précédente — bornes reculées de 7 jours par rapport au 1ᵉʳ appel
    // (c'est `from`/`to` qui discriminent la queryKey, donc le cache, d'une période à l'autre).
    const first = getTotalsSeries.mock.calls[0][1]
    const second = getTotalsSeries.mock.calls[1][1]
    expect(second.from).toBe(shiftDate(first.from, -7))
    expect(second.to).toBe(shiftDate(first.to, -7))
  })
})
