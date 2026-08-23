import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import Finance from './Finance';
import { ToastProvider } from '../components/Toast';

const api = vi.hoisted(() => ({
  useApi: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock('../hooks/useApi', () => api);

const mockFinance = {
  net_income: 1450.75,
  kurs_meta: 17801.17,
  kurs: 17801.17,
  payout_confirmed: 2000.0,
  amortization: 400.0,
  impairment: 100.0,
  refund: 50.0,
  assets: [
    {
      id: 'A-001',
      upstream: 'clinepass',
      label: 'Node Server 1',
      qty: 1,
      cost_per: 150.0,
      curr: 'USD',
      cost_usd: 150.0,
      status: 'active',
    },
    {
      id: 'A-069',
      upstream: 'codebuddy',
      label: 'CAPEX Server 69',
      qty: 2,
      cost_per: 1000000,
      curr: 'IDR',
      cost_usd: 112.35,
      status: 'retired',
    },
  ],
  providers: [{ upstream_slug: 'clinepass', n: 12 }],
};

const mockPayouts = {
  payouts: [
    {
      ref: 'payout-1',
      date: '2026-08-20',
      note: 'Payout · completed',
      usd: 500.0,
      status: 'confirmed',
      destination: '0x1234...5678',
    },
  ],
  total: 500.0,
  count: 1,
};

describe('Finance Hub Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.useApi.mockImplementation((path) =>
      path === '/api/finance'
        ? { data: mockFinance, loading: false, error: null, reload: vi.fn() }
        : { data: mockPayouts, loading: false, error: null, reload: vi.fn() }
    );
  });

  it('renders P&L overview KPIs and currency toggle', () => {
    render(
      <ToastProvider>
        <Finance />
      </ToastProvider>
    );

    expect(screen.getByText(/Finance & Profitability/i)).toBeInTheDocument();
    expect(screen.getAllByText(/\$1,450.75/i).length).toBeGreaterThan(0);

    // Switch to IDR currency
    const idrButton = screen.getByRole('button', { name: /IDR \(Rp\)/i });
    fireEvent.click(idrButton);
    expect(screen.getAllByText(/Rp/i).length).toBeGreaterThan(0);
  });

  it('switches tabs to view Asset Inventory and Payouts', () => {
    render(
      <ToastProvider>
        <Finance />
      </ToastProvider>
    );

    // Click Asset tab
    const assetTab = screen.getByRole('button', { name: /Asset Inventory/i });
    fireEvent.click(assetTab);
    expect(screen.getByText('A-001')).toBeInTheDocument();
    expect(screen.getByText('A-069')).toBeInTheDocument();

    // Click Payout tab
    const payoutTab = screen.getByRole('button', { name: /Payouts & Withdrawals/i });
    fireEvent.click(payoutTab);
    expect(screen.getByText('payout-1')).toBeInTheDocument();
  });
});
