import '@testing-library/jest-dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

vi.stubGlobal('fetch', vi.fn())
if (typeof window !== 'undefined') {
  window.scrollTo = vi.fn()
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})
