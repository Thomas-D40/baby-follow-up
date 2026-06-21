import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Isolate tests: unmount React trees and reset the persisted selection between cases.
afterEach(() => {
  cleanup()
  localStorage.clear()
})
