import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PricingPage from './PricingPage';

describe('PricingPage', () => {
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

  it('renders global_trigger_pct field (config global per provider)', () => {
    render(<PricingPage
      globals={{ clinepass: { max_ask_pct: 0.05, global_trigger_pct: 15 } }}
      overrides={[]}
      orderbook={[]}
    />);
    expect(screen.getAllByText(/global_trigger_pct/i).length).toBeGreaterThan(0);
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
});
