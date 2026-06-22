import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NapPanel from './NapPanel'

vi.mock('../api', () => ({
  getCurrentNap: vi.fn(),
  listNaps: vi.fn(),
  startNap: vi.fn(),
  endNap: vi.fn(),
  reopenNap: vi.fn(),
  // `useDeleteEvent` route vers les 3 clients de suppression : tous doivent exister dans le mock.
  deleteNap: vi.fn(),
  deleteBottleFeeding: vi.fn(),
  deleteStool: vi.fn(),
}))
import { getCurrentNap, listNaps, startNap, endNap, deleteNap } from '../api'

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><NapPanel babyId="b1" /></QueryClientProvider>,
  )
}

const ONE_NAP = { id: 'n1', startAt: '2026-06-21T10:00:00.000Z', endAt: '2026-06-21T11:00:00.000Z', authorId: 'u1' }

describe('NapPanel (bouton contextuel + 409 en info, D4-K/D4-L)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listNaps.mockResolvedValue({ items: [], nextCursor: null })
  })

  it('affiche « Début de sieste » quand aucune sieste n’est en cours (current = null)', async () => {
    getCurrentNap.mockResolvedValue(null)
    renderPanel()
    expect(await screen.findByRole('button', { name: 'Début de sieste' })).toBeInTheDocument()
  })

  it('affiche « Fin de sieste » quand une sieste est en cours (current = nap ouverte)', async () => {
    getCurrentNap.mockResolvedValue({ id: 'n1', startAt: '2026-06-21T10:00:00.000Z', endAt: null, authorId: 'u1' })
    renderPanel()
    expect(await screen.findByRole('button', { name: 'Fin de sieste' })).toBeInTheDocument()
  })

  it('désactive le bouton au submit (anti double-saisie, D4-K)', async () => {
    getCurrentNap.mockResolvedValue(null)
    let resolve
    startNap.mockImplementation(() => new Promise((r) => { resolve = r }))
    renderPanel()

    const btn = await screen.findByRole('button', { name: 'Début de sieste' })
    await userEvent.click(btn)

    expect(startNap).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('button', { name: '…' })).toBeDisabled())
    await userEvent.click(screen.getByRole('button', { name: '…' })) // 2e tap ignoré
    expect(startNap).toHaveBeenCalledTimes(1)

    resolve({ id: 'n1' })
  })

  it('affiche un 409 de fin en info neutre (role=status), pas en erreur (D4-K)', async () => {
    getCurrentNap.mockResolvedValue({ id: 'n1', startAt: '2026-06-21T10:00:00.000Z', endAt: null, authorId: 'u1' })
    const conflict = Object.assign(new Error('end -> 409'), { status: 409 })
    endNap.mockRejectedValue(conflict)
    renderPanel()

    await userEvent.click(await screen.findByRole('button', { name: 'Fin de sieste' }))

    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Aucune sieste en cours.')
    expect(screen.queryByText("Échec de l'opération.")).not.toBeInTheDocument()
  })
})

describe('NapPanel — suppression (Épic 7, confirmation + mapping delete, D7-B/D7-C/D7-D)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getCurrentNap.mockResolvedValue(null)
    listNaps.mockResolvedValue({ items: [ONE_NAP], nextCursor: null })
  })

  it('exige une confirmation : 1er clic n’appelle pas l’API, « Annuler » referme sans appel', async () => {
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la sieste/ }))
    expect(deleteNap).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }))
    expect(deleteNap).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Oui, supprimer' })).not.toBeInTheDocument()
  })

  it('« Oui, supprimer » appelle deleteNap avec le bon id', async () => {
    deleteNap.mockResolvedValue(null)
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la sieste/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteNap).toHaveBeenCalled())
    expect(deleteNap.mock.calls[0]).toEqual(['b1', 'n1'])
  })

  it('un 404 de suppression est un succès idempotent : PAS « Action impossible. » (D7-D)', async () => {
    deleteNap.mockRejectedValue(Object.assign(new Error('delete -> 404'), { status: 404 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la sieste/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    await waitFor(() => expect(deleteNap).toHaveBeenCalled())
    expect(screen.queryByText('Action impossible.')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // succès idempotent → notice de succès
    expect(await screen.findByText('Sieste supprimée.')).toBeInTheDocument()
  })

  it('un 500 de suppression reste une erreur visible (R3)', async () => {
    deleteNap.mockRejectedValue(Object.assign(new Error('delete -> 500'), { status: 500 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la sieste/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Échec de la suppression.')
    expect(screen.queryByText('Sieste supprimée.')).not.toBeInTheDocument()
  })
})
