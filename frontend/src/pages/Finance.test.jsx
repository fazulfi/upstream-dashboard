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

  it('handles Transfer to Consumer modal flow and submission', async () => {
    api.apiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, transferred: 100 }),
    });

    render(
      <ToastProvider>
        <Finance />
      </ToastProvider>
    );

    // Open transfer modal
    const transferBtn = screen.getByTestId('btn-open-transfer');
    fireEvent.click(transferBtn);
    expect(screen.getByTestId('transfer-modal')).toBeInTheDocument();
    expect(screen.getByText('Transfer ke Saldo Consumer')).toBeInTheDocument();

    // Click MAX button
    const maxBtn = screen.getByRole('button', { name: 'MAX' });
    fireEvent.click(maxBtn);
    const amountInput = screen.getByPlaceholderText('0.00');
    expect(Number(amountInput.value)).toBeGreaterThan(0);

    // Submit transfer
    const submitBtn = screen.getByRole('button', { name: 'Konfirmasi Transfer' });
    fireEvent.click(submitBtn);

    expect(api.apiFetch).toHaveBeenCalledWith(
      '/api/publisher/earnings/transfer',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });

  it('handles Payout OTP 2-step flow and error handling', async () => {
    api.apiFetch.mockImplementation(async (path) => {
      if (path === '/api/publisher/withdrawals/otp') {
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (path === '/api/publisher/withdrawals') {
        return { ok: true, json: async () => ({ ok: true, txHash: '0xabc' }) };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(
      <ToastProvider>
        <Finance />
      </ToastProvider>
    );

    // Open payout modal
    const payoutBtn = screen.getByTestId('btn-open-payout');
    fireEvent.click(payoutBtn);
    expect(screen.getByTestId('payout-modal')).toBeInTheDocument();
    expect(screen.getByText('Tarik Dana (Payout)')).toBeInTheDocument();

    // Fill Step 1: destination & amount
    const destInput = screen.getByPlaceholderText(/e\.g\. 0x71C/i);
    const amountInput = screen.getByPlaceholderText('0.00');
    fireEvent.change(destInput, { target: { value: '0x1234567890abcdef' } });
    fireEvent.change(amountInput, { target: { value: '50' } });

    // Request OTP
    const requestOtpBtn = screen.getByRole('button', { name: /Minta Kode OTP/i });
    fireEvent.click(requestOtpBtn);

    expect(api.apiFetch).toHaveBeenCalledWith(
      '/api/publisher/withdrawals/otp',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ destination: '0x1234567890abcdef', amount: 50 }),
      })
    );

    // Step 2: enter OTP
    const otpInput = await screen.findByPlaceholderText('123456');
    expect(otpInput).toBeInTheDocument();
    fireEvent.change(otpInput, { target: { value: '654321' } });

    // Confirm withdrawal
    const confirmBtn = screen.getByRole('button', { name: 'Konfirmasi Penarikan' });
    fireEvent.click(confirmBtn);

    expect(api.apiFetch).toHaveBeenCalledWith(
      '/api/publisher/withdrawals',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          destination: '0x1234567890abcdef',
          amount: 50,
          otp: '654321',
        }),
      })
    );
  });
});
