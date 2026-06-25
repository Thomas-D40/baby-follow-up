import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NapEditForm from './NapEditForm'

const CLOSED = { id: 'n1', startAt: '2026-06-21T08:00:00.000Z', endAt: '2026-06-21T09:00:00.000Z' }

describe('NapEditForm (Épic 8, DA-1/DA-3)', () => {
  it('préremplit début et fin depuis `initial`', () => {
    render(<NapEditForm onSubmit={vi.fn()} initial={CLOSED} />)
    // les datetime-local sont en heure locale : on vérifie juste qu'ils sont renseignés et non vides
    expect(screen.getByLabelText('Début')).not.toHaveValue('')
    expect(screen.getByLabelText('Fin')).not.toHaveValue('')
  })

  it('soumet un patch { startAt, endAt } en ISO', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<NapEditForm onSubmit={onSubmit} initial={CLOSED} />)

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const patch = onSubmit.mock.calls[0][0]
    expect(typeof patch.startAt).toBe('string')
    expect(typeof patch.endAt).toBe('string')
    expect(patch.startAt).toMatch(/Z$/)
    expect(patch.endAt).toMatch(/Z$/)
  })

  it('refuse une fin antérieure au début (miroir borne serveur), sans appel', async () => {
    const onSubmit = vi.fn()
    render(<NapEditForm onSubmit={onSubmit} initial={CLOSED} />)

    // place la fin avant le début
    await userEvent.clear(screen.getByLabelText('Fin'))
    await userEvent.type(screen.getByLabelText('Fin'), '2026-06-21T07:00')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText(/postérieure au début/)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('mappe un 409 sur un message clair « terminez-la d’abord » (DA-3)', async () => {
    const onSubmit = vi.fn().mockRejectedValue(Object.assign(new Error('-> 409'), { status: 409 }))
    render(<NapEditForm onSubmit={onSubmit} initial={CLOSED} />)

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText(/terminez-la d’abord/)).toBeInTheDocument()
  })

  it('désactive le bouton pendant la soumission (anti double-submit, DA-4)', async () => {
    let resolve
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r }))
    render(<NapEditForm onSubmit={onSubmit} initial={CLOSED} />)

    const btn = screen.getByRole('button', { name: 'Enregistrer' })
    await userEvent.click(btn)
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(btn).toBeDisabled()

    await userEvent.click(btn) // 2e tap ignoré
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolve()
    await waitFor(() => expect(btn).not.toBeDisabled())
  })
})
