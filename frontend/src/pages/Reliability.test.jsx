import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Reliability from './Reliability'

const api = vi.hoisted(() => ({
  summary: vi.fn(), cycles: vi.fn(), events: vi.fn(), models: vi.fn(), transition: vi.fn(),
}))
const stream = vi.hoisted(() => ({ status: 'live', error: null, reconnect: vi.fn() }))
vi.mock('../lib/reliabilityApi', () => ({ reliabilityApi: api, unwrap: (x) => x }))
vi.mock('../hooks/useReliabilityStream', () => ({ useReliabilityStream: (onEvent, recover) => ({ ...stream, recover, onEvent }) }))

const payload = { armed: false, service_status: 'healthy', model_count: 1 }
function ok() {
  api.summary.mockResolvedValue(payload); api.cycles.mockResolvedValue([]); api.events.mockResolvedValue([]); api.models.mockResolvedValue([])
}

describe('Reliability landing page', () => {
  beforeEach(() => { vi.clearAllMocks(); stream.status = 'live'; stream.error = null; ok() })

  it('shows loading/empty state and recovered controls', async () => {
    let resolve
    api.summary.mockReturnValue(new Promise(r => { resolve = r }))
    api.cycles.mockReturnValue(new Promise(() => {})); api.events.mockReturnValue(new Promise(() => {})); api.models.mockReturnValue(new Promise(() => {}))
    render(<Reliability />)
    expect(screen.getByText('No model snapshot is available yet.')).toBeInTheDocument()
    resolve(payload)
  })

  it('shows REST recovery failure', async () => {
    api.summary.mockRejectedValue(new Error('HTTP 500'))
    render(<Reliability />)
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 500')
  })

  it('shows SSE auth-required and reconnect alerts', async () => {
    stream.status = 'auth-required'; const view = render(<Reliability />)
    expect(screen.getByRole('alert')).toHaveTextContent(/session expired/i)
    stream.status = 'reconnecting'; stream.error = new Error('stream ended')
    view.rerender(<Reliability />)
    expect(screen.getByRole('button', { name: 'Retry connection' })).toBeInTheDocument()
  })

  it('arms and disarms with audit feedback and reports transition failure', async () => {
    render(<Reliability />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Arm daemon' })).toBeInTheDocument())
    api.transition.mockResolvedValue({ operator: 'tester', timestamp: '2026-08-20T00:00:00Z' })
    fireEvent.click(screen.getByRole('button', { name: 'Arm daemon' }))
    expect(await screen.findByText(/Audit recorded/)).toBeInTheDocument()
    api.transition.mockRejectedValue(new Error('denied'))
    fireEvent.click(screen.getByRole('button', { name: 'Arm daemon' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('denied')
  })
})
