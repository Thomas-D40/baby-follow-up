import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  updateBottleFeeding,
  updateBreastfeeding,
  updateMedicalCare,
  updateMedication,
  updateNap,
  updateSolidMeal,
  updateStool,
  updateTemperature,
  updateUrine,
} from '../api'

// Recap event type -> update client; every client takes (babyId, id, patch). `eye_care` and
// `nose_care` are two recap types of ONE `medical_care` resource (K1), hence one client.
// Mirror of DELETE_CLIENT in useDeleteEvent.
const UPDATE_CLIENT = {
  bottle_feeding: updateBottleFeeding,
  nap: updateNap,
  stool: updateStool,
  urine: updateUrine,
  temperature: updateTemperature,
  eye_care: updateMedicalCare,
  nose_care: updateMedicalCare,
  breastfeeding: updateBreastfeeding,
  solid_meal: updateSolidMeal,
  medication: updateMedication,
}

// Edit from the recap. retry: 0 (no replay on a lost response); PREFIX invalidation refreshes the
// events and the totals of the day. Unlike the creation hooks, it never touches the remembered
// feeding mode (D18-AK).
export function useUpdateEvent(babyId, { onSuccess } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ type, id, patch }) => UPDATE_CLIENT[type](babyId, id, patch),
    retry: 0,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['babies', babyId] })
      onSuccess?.()
    },
  })
}
