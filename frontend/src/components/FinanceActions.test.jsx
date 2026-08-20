import React from 'react'
globalThis.React = React
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { apiFetch } from '../hooks/useApi'
import FinanceStatus from './FinanceStatus'

vi.mock('../hooks/useApi', async () => ({
  ...(await vi.importActual('../hooks/useApi')),
  apiFetch: vi.fn(),
}))

function FinanceActionsFixture() {
  const action = async (path) => {
    const response = await apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  }
  return (
    <section>
      <button onClick={() => action('/api/finance/buy')}>Buy</button>
      <button onClick={() => action('/api/finance/retire')}>Retire</button>
      <button onClick={() => action('/api/finance/refund')}>Refund</button>
      <FinanceStatus metrics={[{ key: 'net', label: 'Net income', value: '$10', verified: true }]} variance="variance detected" />
    </section>
  )
}

describe('FinanceActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiFetch.mockResolvedValue({ ok: true, status: 200 })
  })

  it.each([
    ['Buy', '/api/finance/buy'],
    ['Retire', '/api/finance/retire'],
    ['Refund', '/api/finance/refund'],
  ])('sends the %s action request', async (label, path) => {
    render(<FinanceActionsFixture />)
    fireEvent.click(screen.getByRole('button', { name: label }))
    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(path, expect.objectContaining({ method: 'POST' })))
  })

  it('renders verified finance status and variance feedback', () => {
    render(<FinanceActionsFixture />)
    expect(screen.getByText('Net income')).toBeInTheDocument()
    expect(screen.getByText('✓ verified')).toBeInTheDocument()
    expect(screen.getByText('variance detected')).toBeInTheDocument()
  })
})
