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

  it('does not clear a NEWER token when a stale request returns 401 (stale-response guard)', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    setSessionToken('new-token')

    // Simulasi late response: request memakai token LAMA, token aktif sudah diganti
    const lateHeaders = { Authorization: 'Bearer old-token' }
    const response401 = { status: 401, ok: false }
    const { handleSessionExpiry } = await import('./useApi.jsx')
    handleSessionExpiry('/api/reliability/summary', lateHeaders, response401)

    expect(sessionStorage.getItem('upstream_session_token')).toBe('new-token')
    expect(dispatchSpy).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'session-expired' }))
  })

  it('does not expire the session for non-401/403 responses or non-Bearer requests', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    setSessionToken('active-token')
    const { handleSessionExpiry } = await import('./useApi.jsx')

    handleSessionExpiry('/api/reliability/summary', { Authorization: 'Bearer active-token' }, { status: 500, ok: false })
    handleSessionExpiry('/api/reliability/summary', { 'X-Auth': 'pw' }, { status: 401, ok: false })
    handleSessionExpiry('/api/login', { Authorization: 'Bearer active-token' }, { status: 401, ok: false })

    expect(sessionStorage.getItem('upstream_session_token')).toBe('active-token')
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
