import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import App from './App'
import { setSessionToken } from './hooks/useApi'

vi.mock('./pages/Reliability', () => ({ default: () => <div>Reliability landing</div> }))
vi.mock('./components/Layout', () => ({ default: () => <div>Layout</div> }))
vi.mock('./hooks/useApi', async () => ({ ...(await vi.importActual('./hooks/useApi')), loginWithPassword: vi.fn() }))
import { loginWithPassword } from './hooks/useApi'

describe('App routing', () => {
  it('shows login when unauthenticated and protected landing after login', async () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Upstream — Operations' })).toBeInTheDocument()
    loginWithPassword.mockImplementation(async () => { setSessionToken('token'); return 'token' })
    fireEvent.change(screen.getByPlaceholderText('Dashboard password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    await waitFor(() => expect(screen.getByText('Layout')).toBeInTheDocument())
  })

  it('renders the error fallback boundary with an injected render failure', () => {
    function ThrowingFixture() {
      throw new Error('fixture failure')
    }

    render(<App appChildren={<ThrowingFixture />} />)

    expect(screen.getByRole('heading', { name: 'Render error' })).toBeInTheDocument()
    expect(screen.getByText(/fixture failure/)).toBeInTheDocument()
  })

  it('replaces protected content on session expiry and clears the token', async () => {
    setSessionToken('valid-token')
    loginWithPassword.mockResolvedValue('new-token')
    render(<App />)
    expect(screen.getByText('Layout')).toBeInTheDocument()

    await act(async () => {
      window.dispatchEvent(new CustomEvent('session-expired', {
        detail: { message: 'Sesi berakhir. Silakan masuk kembali.' },
      }))
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Sesi berakhir. Silakan masuk kembali.')
    expect(screen.getByRole('heading', { name: 'Upstream — Operations' })).toBeInTheDocument()
    expect(sessionStorage.getItem('upstream_session_token')).toBeNull()
    expect(screen.queryByText('Layout')).not.toBeInTheDocument()
  })
})
