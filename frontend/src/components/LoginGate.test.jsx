import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import LoginGate from './LoginGate'
import { setSessionToken } from '../hooks/useApi'

describe('LoginGate', () => {
  it('renders the login form and ambient mesh when there is no token', () => {
    render(<LoginGate><div>protected content</div></LoginGate>)
    expect(screen.getByRole('heading', { name: 'Upstream — Operations' })).toBeInTheDocument()
    expect(screen.queryByText('protected content')).not.toBeInTheDocument()
    expect(document.querySelector('.ambient-mesh-container')).toBeInTheDocument()
    expect(document.querySelector('.ambient-mesh-dark')).toBeInTheDocument()
    expect(document.querySelector('.ambient-mesh-light')).toBeInTheDocument()
  })

  it('disables submit for an empty password', () => {
    render(<LoginGate><div>protected content</div></LoginGate>)
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeDisabled()
  })

  it('stores the token and reveals children after successful login with operator name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: 'token-1' }) }))
    render(<LoginGate><div>protected content</div></LoginGate>)
    fireEvent.change(screen.getByPlaceholderText('Dashboard password'), { target: { value: 'secret' } })
    fireEvent.change(screen.getByPlaceholderText(/Operator name/i), { target: { value: 'Operator John' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    await waitFor(() => expect(screen.getByText('protected content')).toBeInTheDocument())
    setSessionToken('token-1')
    expect(sessionStorage.getItem('upstream_session_token')).toBe('token-1')
  })

  it('shows a failed login alert', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    render(<LoginGate><div>protected content</div></LoginGate>)
    fireEvent.change(screen.getByPlaceholderText('Dashboard password'), { target: { value: 'bad' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Login gagal: login failed')
  })

  it('clears the token and shows an explicit session expired message when Task 4 dispatches session-expired', async () => {
    setSessionToken('expired-token')
    render(<LoginGate><div>protected content</div></LoginGate>)

    act(() => {
      window.dispatchEvent(new CustomEvent('session-expired', {
        detail: { message: 'Sesi berakhir. Silakan masuk kembali.' },
      }))
    })

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Sesi berakhir. Silakan masuk kembali.'))
    expect(sessionStorage.getItem('upstream_session_token')).toBeNull()
    expect(screen.queryByText('protected content')).not.toBeInTheDocument()
  })
})
