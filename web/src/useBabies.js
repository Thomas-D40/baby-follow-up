import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listBabies } from './api'

const STORAGE_KEY = 'suivibaby.selectedBabyId'
const FIVE_MINUTES = 5 * 60 * 1000 // D2-C: TanStack freshness window

/**
 * Pure reconciliation of the current-baby selection against the fresh list (D2-C). Unit-tested.
 * - exactly one baby → implicit selection (no picker)
 * - a stored selection still present in the list → kept
 * - orphan (deleted/unlinked) or absent selection → null (caller shows the picker)
 */
export function reconcileSelection(babies, selectedId) {
  if (babies.length === 1) return babies[0].id
  if (selectedId && babies.some((b) => b.id === selectedId)) return selectedId
  return null
}

/** Babies of the current parent, cached with a 5-min freshness window (D2-C). */
export function useBabies() {
  return useQuery({ queryKey: ['babies'], queryFn: listBabies, staleTime: FIVE_MINUTES })
}

/**
 * Current-baby selection: localStorage persistence + reconciliation against the fresh list.
 * The TanStack TTL refreshes the list; this hook keeps the selection honest (a stale localStorage
 * id pointing at an unlinked baby is reset rather than 404-ing on every action).
 */
export function useCurrentBaby(babies) {
  const [storedId, setStoredId] = useState(() => localStorage.getItem(STORAGE_KEY))
  const effectiveId = reconcileSelection(babies, storedId)

  useEffect(() => {
    if (effectiveId === storedId) return
    setStoredId(effectiveId)
    if (effectiveId) {
      localStorage.setItem(STORAGE_KEY, effectiveId)
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }, [effectiveId, storedId])

  function selectBaby(id) {
    setStoredId(id)
    localStorage.setItem(STORAGE_KEY, id)
  }

  const currentBaby = babies.find((b) => b.id === effectiveId) ?? null
  return { currentBaby, currentBabyId: effectiveId, selectBaby }
}
