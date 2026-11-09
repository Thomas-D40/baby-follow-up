import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import MedicationForm from './MedicationForm'
import { toLocalInputValue } from '../stool'

// `MedicationForm` is self-contained (`onSubmit` prop, no data access): no QueryClient needed.

const OPTIONS = ['Doliprane', 'Advil', 'Ventoline', 'Célestène', 'Amoxicilline', 'Smecta', 'Autre']

function renderForm(props = {}) {
  const onSubmit = props.onSubmit ?? vi.fn().mockResolvedValue(undefined)
  return { onSubmit, ...render(<MedicationForm {...props} onSubmit={onSubmit} />) }
}

const group = () => screen.getByRole('group', { name: 'Choix du médicament' })
const option = (name) => within(group()).getByRole('button', { name })
const freeField = () => screen.queryByRole('textbox', { name: 'Médicament' })
const dosage = () => screen.getByRole('textbox', { name: 'Posologie' })
const when = () => screen.getByLabelText('Quand')
const save = () => screen.getByRole('button', { name: 'Enregistrer' })
const pressed = () => OPTIONS.filter((name) => option(name).getAttribute('aria-pressed') === 'true')

describe('MedicationForm — ouverture : la section Médicament apparaît', () => {
  it('formulaire « Prise de médicament » avec les sept options dans l’ordre, aucune enfoncée', () => {
    renderForm()

    expect(screen.getByRole('form', { name: 'Prise de médicament' })).toBeInTheDocument()
    expect(within(group()).getAllByRole('button').map((b) => b.textContent.trim())).toEqual(OPTIONS)
    OPTIONS.forEach((name) => expect(option(name)).toHaveAttribute('aria-pressed', 'false'))
  })

  it('posologie vide, « Quand » prérempli sur maintenant, aucun champ libre', () => {
    renderForm()

    expect(dosage()).toHaveValue('')
    // Read the value then match it: toHaveValue does not take an asymmetric matcher.
    expect(when().value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(freeField()).not.toBeInTheDocument()
  })

  it('posologie en texte libre, sans maxLength (le message de longueur doit rester atteignable)', () => {
    renderForm()

    expect(dosage()).toHaveAttribute('type', 'text')
    expect(dosage()).not.toHaveAttribute('maxlength')
  })

  it('le bouton Enregistrer n’est jamais désactivé faute d’option (D19-R)', () => {
    renderForm()

    expect(save()).toBeEnabled()
  })
})

describe('MedicationForm — noter un médicament par défaut avec sa posologie', () => {
  it('Doliprane + « 1 dose 6 kg » → { occurredAt, medicationName, dosage }', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(option('Doliprane'))
    await userEvent.type(dosage(), '1 dose 6 kg')
    await userEvent.click(save())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: expect.any(String), medicationName: 'Doliprane', dosage: '1 dose 6 kg',
    })
  })

  it('après succès, retour à l’état d’ouverture : aucune option, posologie vide, pas de champ libre, heure sur maintenant', async () => {
    const { onSubmit } = renderForm()
    fireEvent.change(when(), { target: { value: '2020-01-01T10:00' } })

    await userEvent.click(option('Doliprane'))
    await userEvent.type(dosage(), '1 dose 6 kg')
    await userEvent.click(save())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(dosage()).toHaveValue(''))
    expect(pressed()).toEqual([])
    expect(freeField()).not.toBeInTheDocument()
    expect(when().value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(when().value).not.toBe('2020-01-01T10:00')
  })
})

describe('MedicationForm — noter un médicament sans posologie', () => {
  it.each(['', '   '])('Ventoline, posologie « %s » → dosage: null', async (raw) => {
    const { onSubmit } = renderForm()

    await userEvent.click(option('Ventoline'))
    if (raw) await userEvent.type(dosage(), raw)
    await userEvent.click(save())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: expect.any(String), medicationName: 'Ventoline', dosage: null,
    })
  })
})

describe('MedicationForm — une seule option à la fois', () => {
  it('Advil puis Smecta → seule Smecta est enfoncée', async () => {
    renderForm()

    await userEvent.click(option('Advil'))
    expect(pressed()).toEqual(['Advil'])
    await userEvent.click(option('Smecta'))

    expect(pressed()).toEqual(['Smecta'])
  })

  it('toucher de nouveau Smecta la laisse enfoncée, les six autres restent relâchées', async () => {
    renderForm()

    await userEvent.click(option('Smecta'))
    await userEvent.click(option('Smecta'))

    expect(option('Smecta')).toHaveAttribute('aria-pressed', 'true')
    expect(pressed()).toEqual(['Smecta'])
  })
})

describe('MedicationForm — médicament libre via « Autre »', () => {
  it('toucher « Autre » fait apparaître le champ « Médicament » (texte libre, sans maxLength)', async () => {
    renderForm()

    await userEvent.click(option('Autre'))

    expect(freeField()).toBeInTheDocument()
    expect(freeField()).toHaveAttribute('type', 'text')
    expect(freeField()).not.toHaveAttribute('maxlength')
  })

  it('« Gaviscon » → medicationName: Gaviscon (jamais « Autre »)', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(option('Autre'))
    await userEvent.type(freeField(), 'Gaviscon')
    await userEvent.click(save())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].medicationName).toBe('Gaviscon')
  })

  it('un texte égal à un défaut (« doliprane ») est envoyé tel que tapé', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(option('Autre'))
    await userEvent.type(freeField(), 'doliprane')
    await userEvent.click(save())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].medicationName).toBe('doliprane')
  })
})

describe('MedicationForm — un médicament doit être choisi', () => {
  it('aucune option : « Choisissez un médicament. », onSubmit non appelé', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(save())

    expect(screen.getByText('Choisissez un médicament.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('MedicationForm — « Autre » exige un texte', () => {
  it.each(['', '   '])('champ libre « %s » → « Indiquez le médicament. », onSubmit non appelé', async (raw) => {
    const { onSubmit } = renderForm()

    await userEvent.click(option('Autre'))
    if (raw) await userEvent.type(freeField(), raw)
    await userEvent.click(save())

    expect(screen.getByText('Indiquez le médicament.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('MedicationForm — quitter « Autre » vide le champ libre', () => {
  it('Doliprane masque le champ, conserve la posologie et l’heure ; « Autre » le rouvre vide', async () => {
    renderForm()
    await userEvent.click(option('Autre'))
    await userEvent.type(freeField(), 'Gaviscon')
    await userEvent.type(dosage(), '5 ml')
    fireEvent.change(when(), { target: { value: '2026-11-08T14:00' } })

    await userEvent.click(option('Doliprane'))

    expect(freeField()).not.toBeInTheDocument()
    expect(dosage()).toHaveValue('5 ml')
    expect(when()).toHaveValue('2026-11-08T14:00')

    await userEvent.click(option('Autre'))

    expect(freeField()).toBeInTheDocument()
    expect(freeField()).toHaveValue('')
  })
})

describe('MedicationForm — médicament libre trop long', () => {
  it('61 caractères → message, onSubmit non appelé', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(option('Autre'))
    fireEvent.change(freeField(), { target: { value: 'x'.repeat(61) } })
    await userEvent.click(save())

    expect(screen.getByText('Le médicament ne doit pas dépasser 60 caractères.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('60 caractères passent, les espaces de bord ne comptent pas', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(option('Autre'))
    fireEvent.change(freeField(), { target: { value: '  ' + 'x'.repeat(60) + '  ' } })
    await userEvent.click(save())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].medicationName).toBe('x'.repeat(60))
  })
})

describe('MedicationForm — posologie trop longue', () => {
  it('61 caractères → message, onSubmit non appelé', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(option('Doliprane'))
    fireEvent.change(dosage(), { target: { value: 'x'.repeat(61) } })
    await userEvent.click(save())

    expect(screen.getByText('La posologie ne doit pas dépasser 60 caractères.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('60 caractères passent', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(option('Doliprane'))
    fireEvent.change(dosage(), { target: { value: 'x'.repeat(60) } })
    await userEvent.click(save())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].dosage).toBe('x'.repeat(60))
  })
})

describe('MedicationForm — ordre de validation (D19-S)', () => {
  it('médicament manquant ET posologie trop longue → le message du médicament seul', async () => {
    renderForm()

    fireEvent.change(dosage(), { target: { value: 'x'.repeat(61) } })
    await userEvent.click(save())

    expect(screen.getByText('Choisissez un médicament.')).toBeInTheDocument()
    expect(screen.queryByText('La posologie ne doit pas dépasser 60 caractères.')).not.toBeInTheDocument()
  })
})

describe('MedicationForm — les textes sont envoyés tels que saisis', () => {
  it('« Gaviscon   nourrisson » et « 2  ml » : bords retirés, blancs réduits', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(option('Autre'))
    fireEvent.change(freeField(), { target: { value: '  Gaviscon   nourrisson  ' } })
    fireEvent.change(dosage(), { target: { value: '  2  ml' } })
    await userEvent.click(save())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: expect.any(String), medicationName: 'Gaviscon nourrisson', dosage: '2 ml',
    })
  })
})

describe('MedicationForm — la posologie n’est jamais préremplie', () => {
  it('après une prise « 1 dose 6 kg » enregistrée, retoucher Doliprane laisse la posologie vide', async () => {
    const { onSubmit } = renderForm()

    await userEvent.click(option('Doliprane'))
    await userEvent.type(dosage(), '1 dose 6 kg')
    await userEvent.click(save())
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(dosage()).toHaveValue(''))

    await userEvent.click(option('Doliprane'))

    expect(dosage()).toHaveValue('')
  })
})

describe('MedicationForm — heure hors bornes et erreurs serveur', () => {
  it('rejet { status: 400 } → « Données invalides. », sélection et posologie conservées', async () => {
    const onSubmit = vi.fn().mockRejectedValue(Object.assign(new Error('-> 400'), { status: 400 }))
    renderForm({ onSubmit })

    await userEvent.click(option('Doliprane'))
    await userEvent.type(dosage(), '1 dose 6 kg')
    await userEvent.click(save())

    expect(await screen.findByText('Données invalides.')).toBeInTheDocument()
    expect(option('Doliprane')).toHaveAttribute('aria-pressed', 'true')
    expect(dosage()).toHaveValue('1 dose 6 kg')
  })

  it('autre rejet → « Échec de l’enregistrement. », champs conservés', async () => {
    const onSubmit = vi.fn().mockRejectedValue(Object.assign(new Error('-> 500'), { status: 500 }))
    renderForm({ onSubmit })

    await userEvent.click(option('Ventoline'))
    await userEvent.click(save())

    expect(await screen.findByText('Échec de l\'enregistrement.')).toBeInTheDocument()
    expect(option('Ventoline')).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('MedicationForm — double-tap', () => {
  it('envoi en cours : un second clic n’émet pas un second appel, le bouton est désactivé', async () => {
    const onSubmit = vi.fn(() => new Promise(() => {}))
    renderForm({ onSubmit })

    await userEvent.click(option('Doliprane'))
    // Keep the reference: while sending, the button reads « … » and no longer matches « Enregistrer ».
    const button = save()
    await userEvent.click(button)
    await userEvent.click(button)

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(button).toBeDisabled()
  })
})

describe('MedicationForm — édition d’un médicament par défaut', () => {
  const INITIAL = { occurredAt: '2020-03-15T08:00:00.000Z', medicationName: 'Doliprane', dosage: '1 dose 6 kg' }

  it('formulaire « Modifier le médicament » : Doliprane enfoncé, posologie et heure de la prise, aucun champ libre', () => {
    renderForm({ initial: INITIAL })

    expect(screen.getByRole('form', { name: 'Modifier le médicament' })).toBeInTheDocument()
    expect(pressed()).toEqual(['Doliprane'])
    expect(dosage()).toHaveValue('1 dose 6 kg')
    // Exact equality: a "not empty" check would also pass if the time fell back to now.
    expect(when()).toHaveValue(toLocalInputValue(new Date('2020-03-15T08:00:00.000Z')))
    expect(freeField()).not.toBeInTheDocument()
  })

  it('le formulaire ne propose que l’heure, le médicament et la posologie (D19-I)', () => {
    renderForm({ initial: INITIAL })

    const form = screen.getByRole('form', { name: 'Modifier le médicament' })
    expect(within(form).getAllByRole('textbox')).toHaveLength(1)
    expect(within(form).getByRole('textbox', { name: 'Posologie' })).toBeInTheDocument()
    expect(within(form).queryByLabelText('Quantité (ml)')).not.toBeInTheDocument()
    expect(within(form).queryByRole('group', { name: 'Type de soin' })).not.toBeInTheDocument()
  })

  it('enregistrer sans rien changer envoie TOUJOURS les trois champs', async () => {
    const { onSubmit } = renderForm({ initial: INITIAL })

    await userEvent.click(save())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: expect.any(String), medicationName: 'Doliprane', dosage: '1 dose 6 kg',
    })
  })

  it('rien n’est réinitialisé après succès', async () => {
    const { onSubmit } = renderForm({ initial: INITIAL })

    await userEvent.click(save())
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(save()).toBeEnabled())

    expect(pressed()).toEqual(['Doliprane'])
    expect(dosage()).toHaveValue('1 dose 6 kg')
  })
})

describe('MedicationForm — édition d’un médicament libre', () => {
  it.each(['Gaviscon', 'doliprane'])('« %s » rouvre sur « Autre » avec le champ libre rempli', (name) => {
    renderForm({ initial: { occurredAt: '2020-03-15T08:00:00.000Z', medicationName: name, dosage: null } })

    expect(pressed()).toEqual(['Autre'])
    expect(freeField()).toHaveValue(name)
    expect(dosage()).toHaveValue('')
  })
})

describe('MedicationForm — corriger le médicament d’une prise', () => {
  it('« Dolipran » (Autre) → Doliprane, posologie effacée, heure corrigée → dosage: null', async () => {
    const { onSubmit } = renderForm({
      initial: { occurredAt: '2020-03-15T08:00:00.000Z', medicationName: 'Dolipran', dosage: '1 dose 6 kg' },
    })

    await userEvent.click(option('Doliprane'))
    expect(freeField()).not.toBeInTheDocument()
    await userEvent.clear(dosage())
    fireEvent.change(when(), { target: { value: '2026-11-08T14:00' } })
    await userEvent.click(save())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0]).toEqual({
      occurredAt: new Date('2026-11-08T14:00').toISOString(), medicationName: 'Doliprane', dosage: null,
    })
  })
})

describe('MedicationForm — passer d’un défaut à « Autre » à l’édition', () => {
  it('« Advil » → Autre + « Nurofen » → medicationName: Nurofen', async () => {
    const { onSubmit } = renderForm({
      initial: { occurredAt: '2020-03-15T08:00:00.000Z', medicationName: 'Advil', dosage: null },
    })

    await userEvent.click(option('Autre'))
    await userEvent.type(freeField(), 'Nurofen')
    await userEvent.click(save())

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    expect(onSubmit.mock.calls[0][0].medicationName).toBe('Nurofen')
  })
})

describe('MedicationForm — teinte « température » (Épic 22, D22-K)', () => {
  const INITIAL = { occurredAt: '2020-03-15T08:00:00.000Z', medicationName: 'Doliprane', dosage: null }
  const othersThan = (selected) => OPTIONS.filter((name) => name !== selected)

  it('création : l’option touchée prend la teinte « température », les autres restent neutres', async () => {
    renderForm()

    await userEvent.click(option('Doliprane'))

    expect(option('Doliprane')).toHaveClass('toggle-chip', 'toggle-chip--temp-on')
    expect(option('Doliprane')).not.toHaveClass('toggle-chip--care-on')
    othersThan('Doliprane').forEach((name) => {
      expect(option(name)).toHaveClass('toggle-chip')
      expect(option(name)).not.toHaveClass('toggle-chip--temp-on')
      expect(option(name)).not.toHaveClass('toggle-chip--care-on')
    })
  })

  it('création : choisir une autre option relâche la précédente, qui redevient neutre', async () => {
    renderForm()

    await userEvent.click(option('Advil'))
    await userEvent.click(option('Smecta'))

    expect(option('Smecta')).toHaveClass('toggle-chip--temp-on')
    expect(option('Advil')).toHaveClass('toggle-chip')
    expect(option('Advil')).not.toHaveClass('toggle-chip--temp-on')
    expect(option('Advil')).not.toHaveClass('toggle-chip--care-on')
  })

  it('création : « Enregistrer » prend la teinte « température »', () => {
    renderForm()

    expect(save()).toHaveClass('btn', 'btn--temp', 'btn--block', 'btn--lg')
    expect(save()).not.toHaveClass('btn--care')
  })

  it('édition : l’option de la prise et « Enregistrer » ont la même teinte « température »', () => {
    renderForm({ initial: INITIAL })

    expect(option('Doliprane')).toHaveClass('toggle-chip', 'toggle-chip--temp-on')
    expect(option('Doliprane')).not.toHaveClass('toggle-chip--care-on')
    othersThan('Doliprane').forEach((name) => {
      expect(option(name)).not.toHaveClass('toggle-chip--temp-on')
      expect(option(name)).not.toHaveClass('toggle-chip--care-on')
    })
    expect(save()).toHaveClass('btn', 'btn--temp', 'btn--block', 'btn--lg')
    expect(save()).not.toHaveClass('btn--care')
  })
})
