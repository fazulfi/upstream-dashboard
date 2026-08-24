import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PricingPage from './PricingPage';
import ModelDetailDrawer from './ModelDetailDrawer';
import Finance from '../pages/Finance';
import { ToastProvider } from './Toast';

// Mock useApi & apiFetch
vi.mock('../hooks/useApi', () => ({
  apiFetch: vi.fn(),
  useApi: vi.fn((path) => {
    if (path === '/api/finance') {
      return {
        data: {
          net_income: 250.0,
          earnings: 250.0,
          kurs: 16000,
          assets: [],
          providers: [],
        },
        loading: false,
        reload: vi.fn(),
      };
    }
    if (path === '/api/payouts') {
      return {
        data: { payouts: [] },
        loading: false,
        reload: vi.fn(),
      };
    }
    if (path === '/api/market') {
      return {
        data: { models: [], error: 'unavailable' },
        loading: false,
        reload: vi.fn(),
      };
    }
    return { data: null, loading: false, reload: vi.fn() };
  }),
}));

describe('Publisher & Operations Tools — Adversarial Frontend Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('PricingPage handles empty/unavailable market rate responses gracefully without crashing', () => {
    render(
      <ToastProvider>
        <PricingPage globals={{}} overrides={[]} orderbook={[]} />
      </ToastProvider>
    );

    expect(screen.getByText('Live Market Rates & Spread')).toBeInTheDocument();
    expect(screen.getByText('Tidak ada data market rate yang cocok.')).toBeInTheDocument();
  });

  it('Finance handles negative or zero transfer amounts without network submission', async () => {
    const { apiFetch } = await import('../hooks/useApi');

    render(
      <ToastProvider>
        <Finance />
      </ToastProvider>
    );

    // Open transfer modal
    const openBtn = screen.getByTestId('btn-open-transfer');
    fireEvent.click(openBtn);

    const input = screen.getByPlaceholderText('0.00');
    const submitBtn = screen.getByText('Konfirmasi Transfer');

    // Test zero
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.click(submitBtn);
    expect(apiFetch).not.toHaveBeenCalled();

    // Test negative
    fireEvent.change(input, { target: { value: '-15.5' } });
    fireEvent.click(submitBtn);
    expect(apiFetch).not.toHaveBeenCalled();

    // Test string
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.click(submitBtn);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('ModelDetailDrawer handles multi-segment slash model IDs when saving budget', async () => {
    const { apiFetch } = await import('../hooks/useApi');
    apiFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const slashModel = {
      model_id: 'deepseek/deepseek-r1/v3',
      slug: 'deepseek',
      our_price: 1.5,
      competitor_price: 2.0,
    };

    render(
      <ToastProvider>
        <ModelDetailDrawer
          model={slashModel}
          isOpen={true}
          onClose={vi.fn()}
          onUpdated={vi.fn()}
        />
      </ToastProvider>
    );

    const inputCap = screen.getByPlaceholderText('e.g. 2.5000');
    fireEvent.change(inputCap, { target: { value: '2.10' } });

    const saveBudgetBtn = screen.getByText('Save Budget Caps');
    fireEvent.click(saveBudgetBtn);

    await waitFor(() => {
      expect(apiFetch).toHaveBeenCalledWith(
        '/api/budgets/deepseek/deepseek-r1/v3',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            max_input_per_mtok: 2.1,
            max_output_per_mtok: null,
            min_discount_pct: null,
            enabled: true,
          }),
        })
      );
    });
  });
});
