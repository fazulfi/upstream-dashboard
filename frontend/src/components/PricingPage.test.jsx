import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import PricingPage from './PricingPage';

const mockApi = vi.hoisted(() => ({
  useApi: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock('../hooks/useApi', () => mockApi);

const mockMarketData = {
  models: [
    { slug: 'openai/gpt-4o', minAskIn: 2.5, maxAskIn: 3.2, sellersCount: 5 },
    { slug: 'anthropic/claude-3-5-sonnet', minAskIn: 3.0, maxAskIn: 3.8, sellersCount: 3 },
  ],
};

describe('PricingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.useApi.mockReturnValue({
      data: mockMarketData,
      loading: false,
      reload: vi.fn(),
    });
  });

  it('renders globals, overrides and orderbook sections', () => {
    render(<PricingPage
      globals={{ clinepass: { max_ask_pct: 0.05 } }}
      overrides={[{ upstream: 'clinepass', model_id: 'm1', trigger_pct: 0.1 }]}
      orderbook={[{ upstream: 'clinepass', model_id: 'm1', ask: 0.08 }]}
    />);
    expect(screen.getAllByText(/clinepass/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/max_ask_pct/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/trigger_pct/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ask/i).length).toBeGreaterThan(0);
  });

  it('renders global per upstream without trigger field (trigger ada di Auto Pricing)', () => {
    render(<PricingPage
      globals={{ clinepass: { max_ask_pct: 0.05, global_trigger_pct: 15 } }}
      overrides={[]}
      orderbook={[]}
    />);
    expect(screen.getAllByText(/max_ask_pct/i).length).toBeGreaterThan(0);
    expect(screen.queryByText(/global_trigger_pct/i)).not.toBeInTheDocument();
  });

  it('shows Set manual ask action on orderbook rows', () => {
    render(<PricingPage
      globals={{}}
      overrides={[]}
      orderbook={[{ upstream: 'clinepass', model_id: 'm1', ask: 0.08, upstream_catalog_model_id: 'cat-1' }]}
    />);
    expect(screen.getAllByText(/set manual ask/i).length).toBeGreaterThan(0);
  });

  it('opens ask form modal when Set manual ask clicked', () => {
    render(<PricingPage
      globals={{}}
      overrides={[]}
      orderbook={[{ upstream: 'clinepass', model_id: 'm1', ask: 0.08, upstream_catalog_model_id: 'cat-1' }]}
    />);
    fireEvent.click(screen.getAllByText(/set manual ask/i)[0]);
    expect(screen.getAllByText(/ask input per Mtok/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ask output per Mtok/i).length).toBeGreaterThan(0);
  });

  it('renders Live Market Rates table and filters by search query', () => {
    render(<PricingPage
      globals={{}}
      overrides={[]}
      orderbook={[]}
    />);

    expect(screen.getByTestId('live-market-rates-section')).toBeInTheDocument();
    expect(screen.getByText('openai/gpt-4o')).toBeInTheDocument();
    expect(screen.getByText('$2.5000')).toBeInTheDocument();
    expect(screen.getByText('5 sellers')).toBeInTheDocument();
    expect(screen.getByText('anthropic/claude-3-5-sonnet')).toBeInTheDocument();

    // Filter search
    const searchInput = screen.getByPlaceholderText('Filter live market...');
    fireEvent.change(searchInput, { target: { value: 'claude' } });

    expect(screen.queryByText('openai/gpt-4o')).not.toBeInTheDocument();
    expect(screen.getByText('anthropic/claude-3-5-sonnet')).toBeInTheDocument();
  });
});
