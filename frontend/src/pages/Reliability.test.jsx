import React from 'react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import Reliability from './Reliability'

const api = vi.hoisted(() => ({
  summary: vi.fn(),
  cycles: vi.fn(),
  events: vi.fn(),
  models: vi.fn(),
  usageWindows: vi.fn(),
  transition: vi.fn(),
}))

let streamHandler = null
const stream = vi.hoisted(() => ({ status: 'live', error: null, reconnect: vi.fn() }))
vi.mock('../lib/reliabilityApi', () => ({ reliabilityApi: api, unwrap: (x) => x }))
vi.mock('../hooks/useReliabilityStream', () => ({
  useReliabilityStream: (onEvent, recover) => {
    streamHandler = onEvent
    return { ...stream, recover, onEvent }
  },
}))

const payload = { armed: false, service_status: 'healthy', model_count: 1 }
const sampleModels = [
  { model_id: 'provider-a/model-1', slug: 'provider-a', action: 'undercut', our_price: 0.05, competitor_price: 0.06 },
  { model_id: 'provider-b/model-2', slug: 'provider-b', action: 'leader', our_price: 0.04, competitor_price: 0.05 },
]
const sampleEvents = [
  { event_id: 'ev-1', event_type: 'PRICE_UPDATE', slug: 'provider-a', severity: 'info', occurred_at: '2026-08-20T00:00:00Z' },
  { event_id: 'ev-2', event_type: 'API_ERROR', slug: 'provider-b', severity: 'error', occurred_at: '2026-08-20T00:01:00Z' },
]
const sampleWindows = {
  'provider-a': [
    { windowKind: '5h', usedTokens: 800000, limitTokens: 1000000, usedPct: 80, source: 'poll' },
    { windowKind: '7d', usedTokens: 950000, limitTokens: 1000000, usedPct: 95, source: 'reactive_429' },
  ],
}

function ok() {
  api.summary.mockResolvedValue(payload)
  api.cycles.mockResolvedValue([])
  api.events.mockResolvedValue(sampleEvents)
  api.models.mockResolvedValue(sampleModels)
  api.usageWindows.mockResolvedValue(sampleWindows)
}

describe('Reliability landing page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stream.status = 'live'
    stream.error = null
    ok()
  })

  it('shows loading/empty state and recovered controls', async () => {
    let resolve
    api.summary.mockReturnValue(new Promise((r) => { resolve = r }))
    api.cycles.mockReturnValue(Promise.resolve([]))
    api.events.mockReturnValue(Promise.resolve([]))
    api.models.mockReturnValue(Promise.resolve([]))
    render(<Reliability />)
    expect(screen.getByText('No model snapshot is available yet.')).toBeInTheDocument()
    await act(async () => {
      resolve(payload)
    })
  })

  it('shows REST recovery failure', async () => {
    api.summary.mockRejectedValue(new Error('HTTP 500'))
    render(<Reliability />)
    expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 500')
  })

  it('shows SSE auth-required and reconnect alerts', async () => {
    stream.status = 'auth-required'
    const view = render(<Reliability />)
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/session expired/i))
    stream.status = 'reconnecting'
    stream.error = new Error('stream ended')
    view.rerender(<Reliability />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry connection' })).toBeInTheDocument())
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

  it('handles unknown transition outcome alert', async () => {
    render(<Reliability />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Arm daemon' })).toBeInTheDocument())
    api.transition.mockResolvedValue({ outcome: 'unknown' })
    fireEvent.click(screen.getByRole('button', { name: 'Arm daemon' }))
    expect(await screen.findByText(/Transition outcome is unknown/i)).toBeInTheDocument()
  })

  it('filters models by tab, search input, and opens model detail inspector', async () => {
    render(<Reliability />)
    await waitFor(() => expect(screen.getByText('provider-a/model-1')).toBeInTheDocument())

    // Search model
    const searchInput = screen.getByPlaceholderText('Search model ID...')
    fireEvent.change(searchInput, { target: { value: 'model-2' } })
    expect(screen.queryByText('provider-a/model-1')).not.toBeInTheDocument()
    expect(screen.getByText('provider-b/model-2')).toBeInTheDocument()

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } })
    expect(screen.getByText('provider-a/model-1')).toBeInTheDocument()

    // Filter by tab
    const undercutTab = screen.getByRole('button', { name: /Undercut/i })
    fireEvent.click(undercutTab)
    expect(screen.getByText('provider-a/model-1')).toBeInTheDocument()
    expect(screen.queryByText('provider-b/model-2')).not.toBeInTheDocument()

    // Click model card/row to open detail inspector
    fireEvent.click(screen.getByText('provider-a/model-1'))
    expect(screen.getByRole('button', { name: 'Close Inspector' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close Inspector' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Close Inspector' })).not.toBeInTheDocument())
  })

  it('filters event list by severity and processes stream events', async () => {
    render(<Reliability />)
    await waitFor(() => expect(screen.getByText('PRICE_UPDATE')).toBeInTheDocument())

    // Filter severity
    const severitySelect = screen.getByRole('combobox', { name: 'Filter severity' })
    fireEvent.change(severitySelect, { target: { value: 'error' } })
    expect(screen.queryByText('PRICE_UPDATE')).not.toBeInTheDocument()
    expect(screen.getByText('API_ERROR')).toBeInTheDocument()

    // Simulate incoming SSE event
    act(() => {
      if (streamHandler) {
        streamHandler({
          payload: {
            event_id: 'ev-new',
            event_type: 'MANUAL_DISARM',
            severity: 'error',
            occurred_at: '2026-08-20T00:02:00Z',
          },
        })
      }
    })

    expect(screen.getByText('MANUAL_DISARM')).toBeInTheDocument()
  })

  it.skip('renders provider quota tracker cards, progress thresholds, and reactive_429 badge', async () => {
    render(<Reliability />)
    await waitFor(() => expect(screen.getByText('Provider Quota & Capacity Tracker')).toBeInTheDocument())
    expect(screen.getByText('80.0%')).toBeInTheDocument()
    expect(screen.getByText('95.0%')).toBeInTheDocument()
    expect(screen.getByTestId('badge-reactive-429')).toBeInTheDocument()
  })
})
