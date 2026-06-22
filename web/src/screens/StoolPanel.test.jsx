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
import { listStools, deleteStool } from '../api'

const ONE = { id: 's1', occurredAt: '2026-06-21T08:00:00.000Z', consistency: 'soft' }

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><StoolPanel babyId="b1" /></QueryClientProvider>,
  )
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
