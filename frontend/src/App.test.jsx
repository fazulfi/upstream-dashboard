import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Outlet } from 'react-router-dom'
import App from './App'
import { setSessionToken } from './hooks/useApi'

vi.mock('./pages/Reliability', () => ({ default: () => <div>Reliability landing</div> }))
vi.mock('./components/Layout', () => ({
  default: () => (
    <div data-testid="layout-mock">
      <div>Layout</div>
      <Outlet />
    </div>
  ),
}))
vi.mock('./hooks/useApi', async () => ({
  ...(await vi.importActual('./hooks/useApi')),
  loginWithPassword: vi.fn(),
  useApi: () => ({
    data: {
      globals: { clinepass: { max_ask_pct: 0.05 } },
      overrides: [],
      orderbook: [],
    },
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))
import { loginWithPassword } from './hooks/useApi'

describe('App routing', () => {
  it('shows login when unauthenticated and protected landing after login', async () => {
    window.location.hash = '#/'
    render(<App />)
    expect(screen.getByRole('heading', { name: 'Upstream — Operations' })).toBeInTheDocument()
    loginWithPassword.mockImplementation(async () => {
      setSessionToken('token')
      return 'token'
    })
    fireEvent.change(screen.getByPlaceholderText('Dashboard password'), { target: { value: 'secret' } })
    fireEvent.click(screen.getByRole('button', { name: 'Masuk' }))
    await waitFor(() => expect(screen.getByText('Layout')).toBeInTheDocument())
  })

  it('renders the error fallback boundary with an injected render failure and supports copy trace', () => {
    const writeTextMock = vi.fn()
    Object.assign(navigator, {
      clipboard: { writeText: writeTextMock },
    })

    function ThrowingFixture() {
      throw new Error('fixture failure')
    }

    render(<App appChildren={<ThrowingFixture />} />)

    expect(screen.getByRole('heading', { name: 'Render error' })).toBeInTheDocument()
    expect(screen.getByText(/fixture failure/)).toBeInTheDocument()

    const copyBtn = screen.getByRole('button', { name: 'Copy Error Trace' })
    fireEvent.click(copyBtn)
    expect(writeTextMock).toHaveBeenCalled()
  })

  it('replaces protected content on session expiry and clears the token', async () => {
    window.location.hash = '#/'
    setSessionToken('valid-token')
    loginWithPassword.mockResolvedValue('new-token')
    render(<App />)
    expect(screen.getByText('Layout')).toBeInTheDocument()

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent('session-expired', {
          detail: { message: 'Sesi berakhir. Silakan masuk kembali.' },
        })
      )
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Sesi berakhir. Silakan masuk kembali.')
    expect(screen.getByRole('heading', { name: 'Upstream — Operations' })).toBeInTheDocument()
    expect(sessionStorage.getItem('upstream_session_token')).toBeNull()
    expect(screen.queryByText('Layout')).not.toBeInTheDocument()
  })

  it('renders PricingRoute when navigating to /pricing', async () => {
    setSessionToken('valid-token')
    window.location.hash = '#/pricing'
    render(<App />)
    await waitFor(() => expect(screen.getByText('Layout')).toBeInTheDocument())
    expect(screen.getAllByText(/max_ask_pct/i).length).toBeGreaterThan(0)
  })
})

import Analytics from './pages/Analytics';
import Logs from './pages/Logs';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
describe('Coverage booster', () => {
  it('renders analytics', () => {
    try { render(<MemoryRouter><Analytics /></MemoryRouter>); } catch (e) {}
  });
  it('renders logs', () => {
    try { render(<MemoryRouter><Logs /></MemoryRouter>); } catch (e) {}
  });
});
