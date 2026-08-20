import React from 'react';
import { render, screen } from '@testing-library/react';
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
});
