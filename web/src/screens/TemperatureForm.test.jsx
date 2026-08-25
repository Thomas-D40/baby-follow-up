import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TemperatureForm from './TemperatureForm'
import { toLocalInputValue } from '../stool'

// `TemperatureForm` est autonome : il reçoit `onSubmit` en prop (aucun appel `../api`), donc
// testable sans QueryClient.

describe('TemperatureForm — saisie de la valeur (US15.1, D15-J)', () => {
  it('TEST DÉCISIF : le champ accepte la frappe de la VIRGULE et l’affiche (disqualifie type="number")', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<TemperatureForm onSubmit={onSubmit} />)

    const field = screen.getByLabelText('Température (°C)')
    await userEvent.type(field, '37,8')

    // Avec type="number", la virgule ne serait même pas restituée et la validation native
    // bloquerait le submit AVANT le message JS → saisie silencieusement rejetée.
    expect(field).toHaveValue('37,8')
    expect(field).toHaveAttribute('type', 'text')
    expect(field).toHaveAttribute('inputMode', 'decimal')

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].temperatureCelsiusX10).toBe(378)
    expect(typeof onSubmit.mock.calls[0][0].occurredAt).toBe('string')
  })

  it('valeur hors bornes : message FR affiché, AUCUNE soumission', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<TemperatureForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Température (°C)'), '378')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('Température invalide (attendue en °C, 30,0 ≤ t ≤ 43,0).')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('valeur vide : message FR, AUCUNE soumission', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<TemperatureForm onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText('La température est requise.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('après un succès en création, le champ se vide pour enchaîner', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<TemperatureForm onSubmit={onSubmit} />)

    const field = screen.getByLabelText('Température (°C)')
    await userEvent.type(field, '37,2')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(field).toHaveValue(''))
  })

  it('après un succès en création, l’heure est RÉARMÉE sur « maintenant » (épisode de fièvre)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<TemperatureForm onSubmit={onSubmit} />)

    // L'utilisateur corrige l'heure de la 1re mesure, puis enchaîne sur une 2e sans rouvrir la feuille.
    const when = screen.getByLabelText('Quand')
    const PASSE = '2020-03-15T09:30'
    await userEvent.clear(when)
    await userEvent.type(when, PASSE)
    expect(when).toHaveValue(PASSE)

    await userEvent.type(screen.getByLabelText('Température (°C)'), '37,2')
    const avant = toLocalInputValue(new Date())
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    // Sans réarmement, la 2e mesure repartirait avec l'heure figée de la 1re.
    await waitFor(() => expect(when).not.toHaveValue(PASSE))
    // Égalité exacte : « maintenant », à la minute qui a pu tourner pendant le clic près.
    expect([avant, toLocalInputValue(new Date())]).toContain(when.value)
  })
})

describe('TemperatureForm — édition (prop initial)', () => {
  it('pré-remplit la valeur en °C (virgule) et l’heure de l’événement', async () => {
    render(<TemperatureForm onSubmit={vi.fn()} initial={{ temperatureCelsiusX10: 384, occurredAt: '2020-03-15T09:30:00.000Z' }} />)

    expect(screen.getByLabelText('Température (°C)')).toHaveValue('38,4')
    // Égalité EXACTE : un « pas vide » passerait aussi bien si l'heure était retombée sur maintenant.
    expect(screen.getByLabelText('Quand')).toHaveValue(toLocalInputValue(new Date('2020-03-15T09:30:00.000Z')))
  })

  it('ne vide ni ne réarme rien après succès en édition (le sheet appelant se ferme)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({})
    render(<TemperatureForm onSubmit={onSubmit} initial={{ temperatureCelsiusX10: 384, occurredAt: '2020-03-15T09:30:00.000Z' }} />)

    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(screen.getByLabelText('Température (°C)')).toHaveValue('38,4')
    // ⛔ Le réarmement de l'heure est réservé à la création.
    expect(screen.getByLabelText('Quand')).toHaveValue(toLocalInputValue(new Date('2020-03-15T09:30:00.000Z')))
  })
})

describe('TemperatureForm — anti double-saisie (D3-G/D15-J)', () => {
  it('un double-tap n’émet QU’UN seul appel : le bouton est désactivé jusqu’au settled', async () => {
    let resolve
    const onSubmit = vi.fn(() => new Promise((r) => { resolve = r }))
    render(<TemperatureForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Température (°C)'), '37,8')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    const busyBtn = await screen.findByRole('button', { name: '…' })
    expect(busyBtn).toBeDisabled()

    // Second tap pendant la mutation en vol : aucun appel supplémentaire.
    await userEvent.click(busyBtn)
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolve({})
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled())
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('un échec réactive le bouton avec un message clair (resoumission manuelle)', async () => {
    const onSubmit = vi.fn().mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    render(<TemperatureForm onSubmit={onSubmit} />)

    await userEvent.type(screen.getByLabelText('Température (°C)'), '37,8')
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(await screen.findByText("Échec de l'enregistrement.")).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled()
  })
})
