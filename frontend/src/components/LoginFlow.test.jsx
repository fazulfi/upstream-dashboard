import React from 'react'
globalThis.React = React
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

const api = vi.hoisted(() => ({
  loginWithPassword: vi.fn(),
  getSessionToken: vi.fn(),
  setSessionToken: vi.fn(),
}))

vi.mock('../hooks/useApi', () => api)
import LoginGate from './LoginGate'

describe('LoginFlow', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
    api.getSessionToken.mockReturnValue('')
  })

  afterEach(() => sessionStorage.clear())

  it('shows the login form when no session token exists', () => {
    render(<LoginGate><div>dashboard</div></LoginGate>)
    expect(screen.getByPlaceholderText('Dashboard password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeInTheDocument()
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument()
  })

  it('submits the password, stores the session token, and renders children', async () => {
    api.loginWithPassword.mockImplementation(async (password) => {
      api.setSessionToken('session-token')
      return password === 'secret' ? 'session-token' : ''
    })

    render(<LoginGate><div>dashboard</div></LoginGate>)
    fireEvent.change(screen.getByPlaceholderText('Dashboard password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))

    await waitFor(() => expect(screen.getByText('dashboard')).toBeInTheDocument())
    expect(api.loginWithPassword).toHaveBeenCalledWith('secret')
    expect(api.setSessionToken).toHaveBeenCalledWith('session-token')
  })

  it('shows a role alert when login fails', async () => {
    api.loginWithPassword.mockRejectedValue(new Error('invalid password'))
    render(<LoginGate><div>dashboard</div></LoginGate>)
    fireEvent.change(screen.getByPlaceholderText('Dashboard password'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Login gagal: invalid password')
  })

  it('returns to the login form when the session-expired event is dispatched', async () => {
    api.getSessionToken.mockReturnValue('valid-token')
    render(<LoginGate><div>dashboard</div></LoginGate>)
    expect(screen.getByText('dashboard')).toBeInTheDocument()

    act(() => window.dispatchEvent(new CustomEvent('session-expired', { detail: { message: 'Sesi berakhir.' } })))

    await waitFor(() => expect(screen.getByPlaceholderText('Dashboard password')).toBeInTheDocument())
    expect(api.setSessionToken).toHaveBeenCalledWith('')
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument()
  })
})
