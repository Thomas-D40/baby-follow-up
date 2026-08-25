import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MedicalCareForm from './MedicalCareForm'
import { toLocalInputValue } from '../stool'

// `MedicalCareForm` est autonome (prop `onSubmit`), testable sans QueryClient.

describe('MedicalCareForm — création : UN seul acte composite (US15.2, D15-M)', () => {
  it('rien de coché : le bouton est désactivé, aucune soumission possible', async () => {
    const onSubmit = vi.fn()
    render(<MedicalCareForm onSubmit={onSubmit} />)

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Yeux' }))
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('Yeux ET Nez cochés → UN SEUL appel { withEye, withNose } — ⛔ jamais deux POST', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<MedicalCareForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Yeux' }))
    await userEvent.click(screen.getByRole('button', { name: 'Nez' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    // Assertion explicite : un geste = une requête (pas de Promise.all de deux créations).
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit.mock.calls[0][0]).toEqual({
      withEye: true,
      withNose: true,
      occurredAt: expect.any(String),
    })
    // Le corps est bien celui de l'acte composite, jamais celui de la ressource.
    expect(onSubmit.mock.calls[0][0].careType).toBeUndefined()
  })

  it('un seul type coché : l’autre part à false (l’acte crée une seule ligne)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<MedicalCareForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nez' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].withEye).toBe(false)
    expect(onSubmit.mock.calls[0][0].withNose).toBe(true)
  })

  it('anti double-saisie : le bouton est désactivé jusqu’au settled, un double-tap n’émet qu’un appel', async () => {
    let resolve
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r }))
    render(<MedicalCareForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Nez' }))
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    const busyBtn = await screen.findByRole('button', { name: '…' })
    expect(busyBtn).toBeDisabled()
    await userEvent.click(busyBtn)
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolve({})
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
  })
})

describe('MedicalCareForm — édition : PATCH par RESSOURCE (K1)', () => {
  it('« eye_care » : libellé dérivé du type, et le PATCH ne porte QUE l’heure', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<MedicalCareForm onSubmit={onSubmit} initial={{ id: 'e1', type: 'eye_care', occurredAt: '2020-03-15T08:00:00.000Z' }} />)

    // Pas de toggles en édition : le type ne change pas, on corrige l'heure.
    expect(screen.queryByRole('button', { name: 'Yeux' })).not.toBeInTheDocument()
    expect(screen.getByText('Soin : Yeux')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    // ⛔ On n'envoie QUE le champ édité : `careType` est immuable ici, le réécrire à chaque
    // correction d'heure n'aurait aucune raison d'être (le service applique ce qu'il reçoit).
    // ⛔ Et jamais le corps de l'acte composite.
    expect(onSubmit.mock.calls[0][0]).toEqual({ occurredAt: expect.any(String) })
  })

  it('« nose_care » : libellé Nez, heure préremplie sur l’événement, PATCH réduit à l’heure', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<MedicalCareForm onSubmit={onSubmit} initial={{ id: 'n1', type: 'nose_care', occurredAt: '2020-03-15T07:00:00.000Z' }} />)

    expect(screen.getByText('Soin : Nez')).toBeInTheDocument()
    // Égalité EXACTE : un « pas vide » passerait aussi bien si l'heure était retombée sur maintenant.
    expect(screen.getByLabelText('Quand')).toHaveValue(toLocalInputValue(new Date('2020-03-15T07:00:00.000Z')))

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toEqual({ occurredAt: expect.any(String) })
  })
})
