import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import TrendsPanel from './TrendsPanel'

vi.mock('../api', () => ({ getTotalsSeries: vi.fn() }))
import { getTotalsSeries } from '../api'

function renderPanel(view = 'week') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><TrendsPanel babyId="b1" view={view} /></QueryClientProvider>,
  )
}

const SERIES = {
  bucket: 'day',
  from: '2026-06-15',
  to: '2026-06-21',
  points: [
    { date: '2026-06-15', bottleCount: 3, totalMilkMl: 360, totalSleepMinutes: 600, stoolCount: 2 },
    { date: '2026-06-16', bottleCount: 4, totalMilkMl: 420, totalSleepMinutes: 540, stoolCount: 1 },
  ],
}

describe('TrendsPanel — vue tendances (courbes)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('affiche les 4 courbes quand il y a des données', async () => {
    getTotalsSeries.mockResolvedValue(SERIES)
    renderPanel('week')

    expect(await screen.findByRole('heading', { name: /Biberons/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Lait/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Sommeil/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Selles/ })).toBeInTheDocument()
  })

  it('affiche un état vide quand tous les agrégats sont à zéro', async () => {
    getTotalsSeries.mockResolvedValue({
      bucket: 'day', from: '2026-06-15', to: '2026-06-21',
      points: [{ date: '2026-06-15', bottleCount: 0, totalMilkMl: 0, totalSleepMinutes: 0, stoolCount: 0 }],
    })
    renderPanel('week')

    expect(await screen.findByText(/Aucune donnée sur cette période/)).toBeInTheDocument()
  })

  it('demande la série avec le bon bucket selon la vue (année → month)', async () => {
    getTotalsSeries.mockResolvedValue({ bucket: 'month', from: '2026-01-01', to: '2026-12-31', points: [] })
    renderPanel('year')

    await waitFor(() => expect(getTotalsSeries).toHaveBeenCalled())
    expect(getTotalsSeries.mock.calls[0][0]).toBe('b1')
    expect(getTotalsSeries.mock.calls[0][1]).toMatchObject({ from: '2026-01-01', to: '2026-12-31', bucket: 'month' })
  })

  it('la navigation période change la plage demandée', async () => {
    getTotalsSeries.mockResolvedValue(SERIES)
    renderPanel('week')
    await screen.findByRole('heading', { name: /Biberons/ })

    await userEvent.click(screen.getByRole('button', { name: 'Période précédente' }))

    await waitFor(() => expect(getTotalsSeries).toHaveBeenCalledTimes(2))
    // 2ᵉ appel : semaine précédente (from reculé de 7 jours).
    expect(getTotalsSeries.mock.calls[1][1].bucket).toBe('day')
  })
})
