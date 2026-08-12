import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import WeightChart from './WeightChart'

vi.mock('../api', () => ({ getWeightHistory: vi.fn() }))
import { getWeightHistory } from '../api'

function renderChart(props = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <WeightChart babyId="b1" sex="female" birthDate="2026-01-01" {...props} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WeightChart — courbe de croissance (US12.1)', () => {
  it('aucune pesée → état vide invitant à saisir (pas de courbe)', async () => {
    getWeightHistory.mockResolvedValue({ points: [] })
    renderChart()
    expect(await screen.findByText(/Aucune pesée enregistrée/)).toBeInTheDocument()
  })

  it('points enfant + bandes du bon sexe → la courbe se monte (état vide absent)', async () => {
    getWeightHistory.mockResolvedValue({
      points: [
        { givenOn: '2026-02-01', weightGrams: 4200 },
        { givenOn: '2026-04-01', weightGrams: 6100 },
      ],
    })
    renderChart({ sex: 'female' })

    // The period selector shows, the empty state does not → the chart is mounted.
    expect(await screen.findByRole('tablist', { name: 'Période de croissance' })).toBeInTheDocument()
    expect(screen.queryByText(/Aucune pesée enregistrée/)).not.toBeInTheDocument()
  })

  it('une seule pesée → pas de crash (domaine non dégénéré), chart monté', async () => {
    getWeightHistory.mockResolvedValue({ points: [{ givenOn: '2026-03-01', weightGrams: 5000 }] })
    renderChart({ sex: 'male' })

    expect(await screen.findByRole('tablist', { name: 'Période de croissance' })).toBeInTheDocument()
    // The three period views are offered.
    expect(screen.getByRole('tab', { name: 'Tout' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Année' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Mois' })).toBeInTheDocument()
  })
})
