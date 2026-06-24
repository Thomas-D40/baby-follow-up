import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom n'implémente pas ResizeObserver, requis par le ResponsiveContainer de Recharts (vue tendances).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// Isolate tests: unmount React trees and reset the persisted selection between cases.
afterEach(() => {
  cleanup()
  localStorage.clear()
})
