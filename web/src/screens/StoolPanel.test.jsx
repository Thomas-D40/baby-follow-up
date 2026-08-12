import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import StoolPanel from './StoolPanel'

vi.mock('../api', () => ({
  createStool: vi.fn(),
  listStools: vi.fn(),
  // `useDeleteEvent` route vers les 3 clients : tous présents dans le mock.
  deleteStool: vi.fn(),
  deleteBottleFeeding: vi.fn(),
  deleteNap: vi.fn(),
}))
import { listStools, deleteStool, createStool } from '../api'

const ONE = { id: 's1', occurredAt: '2026-06-21T08:00:00.000Z', consistency: 'soft' }

const PREFIX = { queryKey: ['babies', 'b1'] }

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { qc, ...render(
    <QueryClientProvider client={qc}><StoolPanel babyId="b1" /></QueryClientProvider>,
  ) }
}

describe('StoolPanel — suppression (Épic 7, D7-B/D7-C)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listStools.mockResolvedValue({ items: [ONE], nextCursor: null })
  })

  it('confirme avant suppression puis appelle deleteStool(babyId, id)', async () => {
    deleteStool.mockResolvedValue(null)
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la selle/ }))
    expect(deleteStool).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))
    await waitFor(() => expect(deleteStool).toHaveBeenCalled())
    expect(deleteStool.mock.calls[0]).toEqual(['b1', 's1'])
  })

  it('404 = succès idempotent : notice de succès, aucune erreur (D7-C)', async () => {
    deleteStool.mockRejectedValue(Object.assign(new Error('-> 404'), { status: 404 }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: /Supprimer la selle/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Oui, supprimer' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Selle supprimée.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('StoolPanel — invalidation par préfixe après création (US11.3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listStools.mockResolvedValue({ items: [ONE], nextCursor: null })
  })

  it('une création réussie invalide le préfixe [babies, b1] (récap calendrier), une seule fois (retry:0)', async () => {
    createStool.mockResolvedValue({ id: 's2', occurredAt: '2026-06-21T09:00:00.000Z', consistency: null })
    const { qc } = renderPanel()
    const spy = vi.spyOn(qc, 'invalidateQueries')
    await screen.findByRole('button', { name: /Supprimer la selle/ }) // liste initiale chargée

    // Selle : occurredAt prérempli sur « maintenant », rien d'obligatoire → valider directement.
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(createStool).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1))
    expect(spy.mock.calls[0][0]).toEqual(PREFIX)
  })
})
