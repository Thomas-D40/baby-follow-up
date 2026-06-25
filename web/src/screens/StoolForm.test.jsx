import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StoolForm from './StoolForm'

describe('StoolForm', () => {
  it('saisie en 1 tap : soumet sans consistance (occurredAt ISO, consistency null)', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<StoolForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const body = onSubmit.mock.calls[0][0]
    expect(body.consistency).toBe(null)
    expect(typeof body.occurredAt).toBe('string')
  })

  it('soumet la consistance choisie une fois les détails dépliés', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<StoolForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: /Préciser/ }))
    await userEvent.selectOptions(screen.getByLabelText('Consistance'), 'liquid')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0].consistency).toBe('liquid')
  })

  it('désactive le bouton pendant la soumission (anti double-saisie, D5-J/D3-G)', async () => {
    let resolve
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r }))
    render(<StoolForm onSubmit={onSubmit} />)

    const btn = screen.getByRole('button', { name: 'Enregistrer' })
    await userEvent.click(btn)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(btn).toBeDisabled()

    await userEvent.click(btn) // 2e tap ignoré tant que la mutation n'est pas settled
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolve() // settled → le bouton se ré-active (D5-J/D3-G)
    await waitFor(() => expect(btn).not.toBeDisabled())
  })

  describe('mode édition (Épic 8, DA-1)', () => {
    it('déplie les détails et préremplit la consistance depuis `initial`', () => {
      render(
        <StoolForm
          onSubmit={vi.fn()}
          initial={{ occurredAt: '2026-06-21T08:30:00.000Z', consistency: 'soft' }}
        />,
      )
      // détails dépliés d'emblée : pas de bouton « Préciser », le select est visible
      expect(screen.queryByRole('button', { name: /Préciser/ })).not.toBeInTheDocument()
      expect(screen.getByLabelText('Consistance')).toHaveValue('soft')
    })

    it('soumet un patch reflétant la consistance modifiée', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined)
      render(
        <StoolForm
          onSubmit={onSubmit}
          initial={{ occurredAt: '2026-06-21T08:30:00.000Z', consistency: 'soft' }}
        />,
      )

      await userEvent.selectOptions(screen.getByLabelText('Consistance'), 'liquid')
      await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

      expect(onSubmit).toHaveBeenCalledTimes(1)
      const patch = onSubmit.mock.calls[0][0]
      expect(patch.consistency).toBe('liquid')
      expect(typeof patch.occurredAt).toBe('string')
    })
  })
})
