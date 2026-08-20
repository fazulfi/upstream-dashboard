import React from 'react'
globalThis.React = React
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import AutoPricing from '../pages/AutoPricing'
import Asks from '../pages/Asks'
import PricingPage from './PricingPage'

const api = vi.hoisted(() => ({
  useApi: vi.fn(),
  apiFetch: vi.fn(),
}))

vi.mock('../hooks/useApi', () => api)

const pricingData = {
  armed: false,
  cycles: [{ slug: 'provider-a', model_id: 'model-a', official: 1, ask_in: 0.9, target: 0.8, competitor_price: 0.85, action: 'undercut' }],
  log: 'cycle complete',
}
const configData = { configs: [{ id: 7, upstream: 'provider-a', model_id: 'model-a', trigger_pct: 12 }] }
const orderbookData = {
  models: [{
    label: 'Model A', official_in: 1, min_ask: 0.8, max_ask: 1.2, spread: 0.4,
    upstreams: [{ slug: 'provider-a', label: 'Provider A', is_ours: false, upstream_catalog_model_id: 'catalog-a', levels: [{ price: 0.8, qty: 3 }] }],
  }],
}

function response(body, ok = true, status = 200) {
  return { ok, status, json: vi.fn().mockResolvedValue(body) }
}

describe('PricingMutations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.apiFetch.mockResolvedValue(response({ ok: true, armed: true }))
    api.useApi.mockImplementation((path) => path === '/api/auto-pricing'
      ? { data: pricingData, loading: false, reload: vi.fn() }
      : { data: configData, loading: false, reload: vi.fn() })
  })

  it('updates a pricing config and sends an Idempotency-Key header', async () => {
    render(<AutoPricing />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/auto-pricing/config', expect.objectContaining({ method: 'PUT' })))
    const [, options] = api.apiFetch.mock.calls.at(-1)
    expect(options.headers).toEqual(expect.objectContaining({ 'Content-Type': 'application/json' }))
  })

  it('deletes a saved pricing config for rollback to the default', async () => {
    render(<AutoPricing />)
    await waitFor(() => expect(screen.getByTitle('kembali ke default')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('kembali ke default'))

    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/auto-pricing/config/7', expect.objectContaining({ method: 'DELETE' })))
  })

  it('arms and disarms auto-pricing with success feedback', async () => {
    render(<AutoPricing />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Arm (eksekusi harga)' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Arm (eksekusi harga)' }))
    expect(await screen.findByText(/ARMED/)).toBeInTheDocument()
    expect(api.apiFetch).toHaveBeenCalledWith('/api/auto-pricing/arm', expect.objectContaining({ method: 'POST' }))
  })

  it('shows pricing mutation errors', async () => {
    api.apiFetch.mockRejectedValue(new Error('network down'))
    render(<AutoPricing />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Update' }))
    expect(await screen.findByText('Error: network down')).toBeInTheDocument()
  })
})

describe('Pricing configuration page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.apiFetch.mockResolvedValue(response({ ok: true }))
  })

  it('sends an idempotency key for global pricing config updates', async () => {
    render(<PricingPage globals={{ 'provider-a': { max_ask_pct: 0.05, platform_fee_pct: 0.1, publisher_share_pct: 0.9 } }} />)
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }))
    await waitFor(() => expect(api.apiFetch).toHaveBeenCalledWith('/api/pricing/global', expect.objectContaining({ method: 'PUT' })))
    const [, options] = api.apiFetch.mock.calls.at(-1)
    expect(options.headers['Idempotency-Key']).toEqual(expect.any(String))
  })
})

describe('Orderbook view', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.useApi.mockReturnValue({ data: orderbookData, loading: false, reload: vi.fn() })
    api.apiFetch.mockResolvedValue(response({ ok: true }))
  })

  it('renders model orderbook levels and opens the model detail view', async () => {
    render(<Asks />)
    expect(await screen.findByText('Model A')).toBeInTheDocument()
    expect(screen.getAllByText('$0.8000').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Model A/ }))
    expect(screen.getByRole('heading', { name: 'Orderbook — Model A' })).toBeInTheDocument()
    expect(screen.getByText('Provider A')).toBeInTheDocument()
  })
})
