import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { apiFetch, loginWithPassword, setSessionToken, useApi } from './useApi.jsx'

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

describe('useApi session and fetch behavior', () => {
  it('injects session token and sends login body', async () => {
    setSessionToken('token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ token: 'next' })))
    await apiFetch('/api/reliability/summary')
    expect(fetch).toHaveBeenCalledWith('/api/reliability/summary', expect.objectContaining({ headers: { Authorization: 'Bearer token' } }))
    await loginWithPassword('secret')
    expect(fetch).toHaveBeenLastCalledWith('/api/login', expect.objectContaining({ body: JSON.stringify({ password: 'secret' }) }))
  })

  it('dispatches session-expired for authenticated HTTP 401/403; Task 4 owns production handling', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    setSessionToken('expired-token')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 401)))

    await apiFetch('/api/reliability/summary')

    expect(sessionStorage.getItem('upstream_session_token')).toBeNull()
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session-expired',
      detail: expect.objectContaining({ message: expect.any(String) }),
    }))
  })

  it('does not expire the session for a failed login response', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    setSessionToken('still-valid')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 401)))

    await expect(loginWithPassword('bad-password')).rejects.toThrow('login failed')

    expect(sessionStorage.getItem('upstream_session_token')).toBe('still-valid')
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'session-expired' }))
  })

  it('tracks HTTP errors and aborts on unmount', async () => {
    const fetchMock = vi.fn((_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      resolve(response({}, 500))
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { result, unmount } = renderHook(() => useApi('/api/reliability/summary'))
    await waitFor(() => expect(result.current.error).toBe('HTTP 500'))
    unmount()
    expect(fetchMock).toHaveBeenCalled()
  })
})
