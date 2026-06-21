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
  deleteNap: vi.fn(),
}))
import { getCurrentNap, listNaps, startNap, endNap } from '../api'

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><NapPanel babyId="b1" /></QueryClientProvider>,
  )
}

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
