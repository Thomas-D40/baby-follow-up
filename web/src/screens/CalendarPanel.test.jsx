import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import CalendarPanel from './CalendarPanel'

vi.mock('../api', () => ({
  getDayEvents: vi.fn(),
  getDailyTotals: vi.fn(),
  // `useDeleteEvent` route vers les 3 clients : tous présents dans le mock.
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
  deleteStool: vi.fn(),
  // Section Vitamines (Épic 9) rendue par CalendarPanel.
  getVitamins: vi.fn(),
  setVitamin: vi.fn(),
  unsetVitamin: vi.fn(),
}))
import { getDayEvents, getDailyTotals, deleteBottleFeeding, deleteNap, getVitamins } from '../api'

const EVENTS = [
  { type: 'bottle_feeding', id: 'bf1', startAt: '2026-06-21T08:00:00.000Z', quantityMl: 120, milkType: 'breast' },
  { type: 'nap', id: 'n1', startAt: '2026-06-21T09:00:00.000Z', endAt: '2026-06-21T10:00:00.000Z' },
]

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><CalendarPanel babyId="b1" /></QueryClientProvider>,
  )
}

describe('CalendarPanel — suppression depuis le calendrier (Épic 7, D7-E)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getDayEvents.mockResolvedValue(EVENTS)
    getDailyTotals.mockResolvedValue({ date: '2026-06-21', totalMilkMl: 120, totalSleepMinutes: 60, stoolCount: 0 })
    getVitamins.mockResolvedValue({ date: '2026-06-21', items: [
      { vitaminType: 'd', given: false, authorId: null },
      { vitaminType: 'k', given: false, authorId: null },
    ] })
  })

  it('ouvre une modale de confirmation (pas de bloc inline) ; « Annuler » la referme sans appel', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer biberon/ }))

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(deleteBottleFeeding).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(deleteBottleFeeding).not.toHaveBeenCalled()
  })

  it('route la suppression selon le type de la ligne (biberon → deleteBottleFeeding)', async () => {
    deleteBottleFeeding.mockResolvedValue(null)
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer biberon/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteBottleFeeding).toHaveBeenCalled())
    expect(deleteBottleFeeding.mock.calls[0]).toEqual(['b1', 'bf1'])
    expect(deleteNap).not.toHaveBeenCalled()
  })

  it('cohérence de cache (D7-C/R1) : rafraîchit events ET daily-totals (invalidation préfixe)', async () => {
    deleteBottleFeeding.mockResolvedValue(null)
    renderPanel()
    await waitFor(() => expect(getDayEvents).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(getDailyTotals).toHaveBeenCalledTimes(1))

    await userEvent.click(await screen.findByRole('button', { name: /Supprimer biberon/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    // L'invalidation par préfixe ['babies','b1'] refait les DEUX requêtes du calendrier.
    await waitFor(() => expect(getDayEvents).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(getDailyTotals).toHaveBeenCalledTimes(2))
  })

  it('un 404 (double-vue) est un succès idempotent : la modale se ferme, aucune erreur (D7-C)', async () => {
    deleteNap.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer sieste/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('un 500 garde la modale ouverte avec une erreur visible (R3)', async () => {
    deleteBottleFeeding.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer biberon/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Échec de la suppression.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
