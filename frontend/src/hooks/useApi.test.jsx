import { describe, it, expect } from 'vitest'
import { usd, idr, usdIdr } from './useApi.jsx'

describe('useApi format helpers', () => {
  it('usd formats numbers with 2 decimals', () => {
    expect(usd(5)).toBe('$5.00')
    expect(usd(1234.5)).toBe('$1,234.50')
    expect(usd(null)).toBe('$0.00')
    expect(usd(undefined)).toBe('$0.00')
  })

  it('idr converts USD with kurs', () => {
    expect(idr(1, 17831.73)).toBe('Rp 17.832')
    expect(idr(5, 17831)).toBe('Rp 89.155')
    expect(idr(null, 17831)).toBe('')
    expect(idr(5, null)).toBe('')
  })

  it('usdIdr combines', () => {
    expect(usdIdr(5, 17831)).toBe('$5.00 (Rp 89.155)')
    expect(usdIdr(5, null)).toBe('$5.00')
  })
})