import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('utils cn helper', () => {
  it('merges class names cleanly', () => {
    expect(cn('px-2 py-1', 'bg-sky-500')).toBe('px-2 py-1 bg-sky-500')
    expect(cn('p-4', 'p-2')).toBe('p-2')
    expect(cn('flex', false && 'hidden', null, undefined, 'items-center')).toBe('flex items-center')
  })
})
