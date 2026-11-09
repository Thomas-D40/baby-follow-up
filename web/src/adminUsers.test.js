import { describe, it, expect } from 'vitest'
import {
  ACCOUNT_REMOVAL_LABELS, ACCOUNT_ROLE_LABEL, ACCOUNT_STATUS_LABEL, accountDisplayName, describeAccountRemoval,
  formatAccountDate,
} from './adminUsers'

describe('adminUsers — libellés de l’écran Utilisateurs (Épic 20)', () => {
  it('libellés de rôle', () => {
    expect(ACCOUNT_ROLE_LABEL).toEqual({ admin: 'Admin', parent: 'Parent' })
  })

  it('libellés de statut', () => {
    expect(ACCOUNT_STATUS_LABEL).toEqual({ active: 'Actif', pending: "En attente d'activation" })
  })
})

describe('formatAccountDate — date de création en Europe/Paris', () => {
  it('créé à 23:30 UTC la veille (UTC+1) : la date de Paris est celle du lendemain', () => {
    expect(formatAccountDate('2026-11-07T23:30:00Z')).toBe('08/11/2026')
  })

  it('heure d’été (UTC+2) : 22:30 UTC bascule aussi sur le lendemain', () => {
    expect(formatAccountDate('2026-07-31T22:30:00Z')).toBe('01/08/2026')
  })

  it('heure d’hiver, milieu de journée : même jour', () => {
    expect(formatAccountDate('2026-11-06T10:00:00Z')).toBe('06/11/2026')
  })
})

describe('accountDisplayName — prénom, sinon email (Épic 24)', () => {
  it('le prénom quand il existe', () => {
    expect(accountDisplayName({ firstName: 'Nadia', email: 'nadia@exemple.fr' })).toBe('Nadia')
  })

  it.each([null, undefined, ''])('prénom %j : l’email tient lieu de nom', (firstName) => {
    expect(accountDisplayName({ firstName, email: 'nadia@exemple.fr' })).toBe('nadia@exemple.fr')
  })
})

describe('ACCOUNT_REMOVAL_LABELS — libellés des deux modes (Épic 24)', () => {
  it('suppression et révocation', () => {
    expect(ACCOUNT_REMOVAL_LABELS).toEqual({
      delete: { trigger: 'Supprimer', confirm: 'Oui, supprimer', failure: 'Échec de la suppression. Réessayez.' },
      revoke: {
        trigger: "Révoquer l'invitation",
        confirm: 'Oui, révoquer',
        failure: 'Échec de la révocation. Réessayez.',
      },
    })
  })
})

describe('describeAccountRemoval — textes de la confirmation (Épic 24, US24.1 et US24.2)', () => {
  const NADIA = { firstName: 'Nadia', email: 'nadia@exemple.fr' }
  const JEANNE = { firstName: 'Jeanne', email: 'jeanne@exemple.fr' }
  const impact = (over = {}) => ({
    userId: 'u1', status: 'active', deletedBabyCount: 0, sharedBabyCount: 0, blockingBabyCount: 0,
    impactToken: 't1', ...over,
  })

  describe('suppression (mode delete)', () => {
    it('compte sans bébé : lignes à zéro masquées', () => {
      expect(describeAccountRemoval('delete', NADIA, impact())).toEqual({
        kind: 'confirm',
        message: 'Supprimer le compte de Nadia ? Action définitive.',
      })
    })

    it('un bébé partagé', () => {
      expect(describeAccountRemoval('delete', NADIA, impact({ sharedBabyCount: 1 })).message).toBe(
        'Supprimer le compte de Nadia ? Ce compte sera retiré de 1 bébé partagé. Action définitive.',
      )
    })

    it('deux bébés partagés (pluriel)', () => {
      expect(describeAccountRemoval('delete', NADIA, impact({ sharedBabyCount: 2 })).message).toBe(
        'Supprimer le compte de Nadia ? Ce compte sera retiré de 2 bébés partagés. Action définitive.',
      )
    })

    it('un bébé supprimé', () => {
      const marc = { firstName: 'Marc', email: 'marc@exemple.fr' }

      expect(describeAccountRemoval('delete', marc, impact({ deletedBabyCount: 1 })).message).toBe(
        'Supprimer le compte de Marc ? 1 bébé et tout son suivi seront supprimés. Action définitive.',
      )
    })

    it('deux bébés supprimés (pluriel « leur »)', () => {
      expect(describeAccountRemoval('delete', NADIA, impact({ deletedBabyCount: 2 })).message).toBe(
        'Supprimer le compte de Nadia ? 2 bébés et tout leur suivi seront supprimés. Action définitive.',
      )
    })

    it('un bébé supprimé et deux partagés : les deux parties séparées par « ; »', () => {
      const paul = { firstName: 'Paul', email: 'paul@exemple.fr' }

      expect(describeAccountRemoval('delete', paul, impact({ deletedBabyCount: 1, sharedBabyCount: 2 })).message).toBe(
        'Supprimer le compte de Paul ? 1 bébé et tout son suivi seront supprimés ; ce compte sera retiré de 2 bébés partagés. Action définitive.',
      )
    })

    it('deux supprimés et deux partagés', () => {
      const text = describeAccountRemoval('delete', NADIA, impact({ deletedBabyCount: 2, sharedBabyCount: 2 })).message

      expect(text).toBe(
        'Supprimer le compte de Nadia ? 2 bébés et tout leur suivi seront supprimés ; ce compte sera retiré de 2 bébés partagés. Action définitive.',
      )
    })

    it('prénom absent : l’email nomme la personne', () => {
      const anonymous = { firstName: null, email: 'nadia@exemple.fr' }

      expect(describeAccountRemoval('delete', anonymous, impact()).message).toBe(
        'Supprimer le compte de nadia@exemple.fr ? Action définitive.',
      )
    })
  })

  describe('révocation (mode revoke)', () => {
    const REVOKE = "Révoquer l'invitation de jeanne@exemple.fr ? Son compte, jamais activé, sera supprimé et son lien ne fonctionnera plus."

    it('sans bébé : ni « Action définitive. » ni phrase d’impact', () => {
      expect(describeAccountRemoval('revoke', JEANNE, impact({ status: 'pending' }))).toEqual({
        kind: 'confirm',
        message: REVOKE,
      })
    })

    it('nomme l’email, jamais le prénom', () => {
      expect(describeAccountRemoval('revoke', JEANNE, impact({ status: 'pending' })).message).not.toContain('Jeanne')
    })

    it('avec un bébé solo, la phrase d’impact suit', () => {
      const text = describeAccountRemoval('revoke', JEANNE, impact({ status: 'pending', deletedBabyCount: 1 })).message

      expect(text).toBe(`${REVOKE} 1 bébé et tout son suivi seront supprimés.`)
    })

    it('avec un bébé partagé, la phrase d’impact suit', () => {
      const text = describeAccountRemoval('revoke', JEANNE, impact({ status: 'pending', sharedBabyCount: 1 })).message

      expect(text).toBe(`${REVOKE} Ce compte sera retiré de 1 bébé partagé.`)
    })
  })

  describe('refus (kind blocked)', () => {
    const LISA = { firstName: 'Lisa', email: 'lisa@exemple.fr' }

    it('un bébé bloquant', () => {
      expect(describeAccountRemoval('delete', LISA, impact({ blockingBabyCount: 1 }))).toEqual({
        kind: 'blocked',
        message: "Lisa est le dernier owner de 1 bébé suivi par d'autres : il faut d'abord désigner un autre owner depuis le Partage de ce bébé, ou le supprimer.",
      })
    })

    it('deux bébés bloquants (pluriel)', () => {
      expect(describeAccountRemoval('delete', LISA, impact({ blockingBabyCount: 2 }))).toEqual({
        kind: 'blocked',
        message: "Lisa est le dernier owner de 2 bébés suivis par d'autres : il faut d'abord désigner un autre owner depuis le Partage de ces bébés, ou les supprimer.",
      })
    })

    it('le refus prime sur les nombres de bébés supprimés ou partagés', () => {
      const { kind, message } = describeAccountRemoval('delete', LISA,
        impact({ blockingBabyCount: 1, deletedBabyCount: 1, sharedBabyCount: 2 }))

      expect(kind).toBe('blocked')
      expect(message).not.toContain('Action définitive')
    })

    it('même refus en mode revoke sur un compte en attente', () => {
      const { kind } = describeAccountRemoval('revoke', LISA, impact({ status: 'pending', blockingBabyCount: 1 }))

      expect(kind).toBe('blocked')
    })
  })

  describe('compte activé entre-temps (kind activated)', () => {
    it('revoke + impact « active »', () => {
      expect(describeAccountRemoval('revoke', JEANNE, impact({ status: 'active' }))).toEqual({
        kind: 'activated',
        message: "Ce compte vient d'être activé.",
      })
    })

    it('prime sur le refus : revoke + active, même avec un bébé bloquant', () => {
      const { kind } = describeAccountRemoval('revoke', JEANNE, impact({ status: 'active', blockingBabyCount: 1 }))

      expect(kind).toBe('activated')
    })

    it('ne concerne pas le mode delete : un compte actif se supprime', () => {
      expect(describeAccountRemoval('delete', NADIA, impact({ status: 'active' })).kind).toBe('confirm')
    })
  })
})
