import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BottleFeedingPanel from './BottleFeedingPanel'

vi.mock('../api', () => ({
  createBottleFeeding: vi.fn(),
  listBottleFeedings: vi.fn(),
  // `useDeleteEvent` route vers les 3 clients : tous présents dans le mock.
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
  deleteStool: vi.fn(),
}))
import { listBottleFeedings, deleteBottleFeeding } from '../api'

const ONE = { id: 'bf1', occurredAt: '2026-06-21T08:00:00.000Z', quantityMl: 120, milkType: 'breast' }

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><BottleFeedingPanel babyId="b1" /></QueryClientProvider>,
  )
}

describe('BottleFeedingPanel — suppression (Épic 7, D7-B/D7-C)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listBottleFeedings.mockResolvedValue({ items: [ONE], nextCursor: null })
  })

  it('confirme avant d’appeler l’API ; « Annuler » referme sans appel', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le biberon de 120 ml' }))
    expect(deleteBottleFeeding).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(deleteBottleFeeding).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Oui, supprimer' })).not.toBeInTheDocument()
  })

  it('« Oui, supprimer » appelle deleteBottleFeeding(babyId, id) et désactive le bouton', async () => {
    let resolve
    deleteBottleFeeding.mockImplementation(() => new Promise((r) => { resolve = r }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le biberon de 120 ml' }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(deleteBottleFeeding.mock.calls[0]).toEqual(['b1', 'bf1'])
    await waitFor(() => expect(screen.getByRole('button', { name: '…' })).toBeDisabled())
    resolve(null)
  })

  it('404 = succès idempotent : notice de succès, aucune erreur (D7-C/R3)', async () => {
    deleteBottleFeeding.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le biberon de 120 ml' }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Biberon supprimé.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('500 reste une erreur visible, pas avalée (R3)', async () => {
    deleteBottleFeeding.mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Supprimer le biberon de 120 ml' }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Échec de la suppression.')
    expect(screen.queryByText('Biberon supprimé.')).not.toBeInTheDocument()
  })
})
