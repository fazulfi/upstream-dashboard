import { afterEach, describe, expect, it, vi } from 'vitest'
import { reliabilityApi, responseMeta, unwrap } from './reliabilityApi.js'

const apiFetch = vi.hoisted(() => vi.fn())

vi.mock('../hooks/useApi.jsx', () => ({ apiFetch }))

const ok = (body) => ({ ok: true, status: 200, json: async () => body })
const failure = (status) => ({ ok: false, status, json: async () => ({}) })

describe('reliabilityApi', () => {
  afterEach(() => apiFetch.mockReset())

  it('fetches summary and unwraps successful responses', async () => {
    apiFetch.mockResolvedValue(ok({ data: { heartbeat: 'fresh' } }))
    await expect(reliabilityApi.summary()).resolves.toEqual({ data: { heartbeat: 'fresh' } })
    expect(apiFetch).toHaveBeenCalledWith('/api/reliability/summary')
  })

  it('bounds list limits and builds query strings', async () => {
    apiFetch.mockResolvedValue(ok({ cycles: [] }))
    await reliabilityApi.cycles({ limit: 999, status: 'completed' })
    expect(apiFetch).toHaveBeenCalledWith('/api/reliability/cycles?limit=50&status=completed')

    apiFetch.mockResolvedValue(ok({ events: [] }))
    await reliabilityApi.events({ limit: 0 })
    expect(apiFetch).toHaveBeenCalledWith('/api/reliability/events?limit=1')

    apiFetch.mockResolvedValue(ok({ models: [] }))
    await reliabilityApi.models({ limit: -10 })
    expect(apiFetch).toHaveBeenCalledWith('/api/reliability/models?limit=1')
  })

  it('fetches transitions and rejects invalid states', async () => {
    apiFetch.mockResolvedValue(ok({ state: 'arm' }))
    await reliabilityApi.transition('arm')
    expect(apiFetch).toHaveBeenCalledWith('/api/reliability/arm', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    })
    expect(() => reliabilityApi.transition('invalid')).toThrow('Invalid reliability transition')
  })

  it('propagates HTTP failures with status and handles response helpers', async () => {
    apiFetch.mockResolvedValue(failure(503))
    await expect(reliabilityApi.summary()).rejects.toMatchObject({ message: 'HTTP 503', status: 503 })
    expect(unwrap({ result: ['cycle'] })).toEqual(['cycle'])
    expect(unwrap(null)).toEqual({})
    expect(responseMeta({ meta: { next: 'cursor' } })).toEqual({ next: 'cursor' })
    expect(responseMeta({})).toEqual({})
  })
})
