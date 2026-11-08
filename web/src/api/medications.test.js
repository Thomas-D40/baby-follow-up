import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./client')
import { apiGet, apiSend } from './client'
import { createMedication, deleteMedication, listMedications, updateMedication } from './medications'

// The HTTP routes are the contract with the server (Épic 19): a wrong path or verb answers 404/405 in
// production while every component test, which mocks this layer, stays green.
describe('clients HTTP des prises de médicament — requêtes émises', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiGet.mockResolvedValue({ items: [], nextCursor: null })
    apiSend.mockResolvedValue({})
  })

  it('listMedications → GET sans paramètre par défaut', () => {
    listMedications('b1')

    expect(apiGet).toHaveBeenCalledWith('/babies/b1/medications')
  })

  it('listMedications → limit et before passés en query string', () => {
    listMedications('b1', { limit: 5, before: 'abc' })

    expect(apiGet).toHaveBeenCalledWith('/babies/b1/medications?limit=5&before=abc')
  })

  it('createMedication → POST avec occurredAt, medicationName et dosage', () => {
    createMedication('b1', { occurredAt: '2026-11-08T12:00:00.000Z', medicationName: 'Doliprane', dosage: '1 dose 6 kg' })

    expect(apiSend).toHaveBeenCalledWith(
      '/babies/b1/medications',
      'POST',
      { occurredAt: '2026-11-08T12:00:00.000Z', medicationName: 'Doliprane', dosage: '1 dose 6 kg' },
    )
  })

  it('updateMedication → PATCH sur la prise, patch transmis tel quel (dosage null = effacée)', () => {
    const patch = { occurredAt: '2026-11-08T12:00:00.000Z', medicationName: 'Doliprane', dosage: null }

    updateMedication('b1', 'm1', patch)

    expect(apiSend).toHaveBeenCalledWith('/babies/b1/medications/m1', 'PATCH', patch)
  })

  it('deleteMedication → DELETE sur la prise', () => {
    deleteMedication('b1', 'm1')

    expect(apiSend.mock.calls[0].slice(0, 2)).toEqual(['/babies/b1/medications/m1', 'DELETE'])
  })
})
