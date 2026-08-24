import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Analytics from './Analytics';
import { ThemeProvider } from '../theme';

const mockApiFetch = vi.fn();
vi.mock('../hooks/useApi', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

const mockCacheStats = {
  range: '24h',
  totals: {
    reqs: 5200,
    promptTokens: 2000000000,
    cachedTokens: 1540000000,
    cacheWriteTokens: 60000000,
    hitRate: 0.77,
    estimatedSavingsUsdc: '770.00',
  },
  rows: [
    {
      label: 'cp/cline-pass/deepseek-v4-flash',
      reqs: 4200,
      promptTokens: 1800000000,
      cachedTokens: 1400000000,
      cacheWriteTokens: 50000000,
      hitRate: 0.777,
    },
    {
      label: 'openai/gpt-4o',
      reqs: 1000,
      promptTokens: 200000000,
      cachedTokens: 140000000,
      cacheWriteTokens: 10000000,
      hitRate: 0.70,
    },
  ],
};

const mockBreakdown = {
  range: '24h',
  byModel: [
    {
      model: 'deepseek-v4-flash',
      reqs: 4200,
      tokens: 2200000000,
      promptTokens: 1800000000,
      cachedTokens: 1400000000,
      completionTokens: 400000000,
      costUsdc: '45.20',
    },
  ],
  byProvider: [
    {
      provider: 'cline-pass',
      reqs: 4200,
      tokens: 2200000000,
      costUsdc: '45.20',
    },
  ],
};

function renderAnalytics() {
  return render(
    <ThemeProvider>
      <Analytics />
    </ThemeProvider>
  );
}

describe('Analytics Page (Consumer Telemetry & Cache Efficiency)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches and renders cache efficiency ring, KPI metrics, token composition, and model table', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url.includes('/api/usage/cache-stats')) {
        return { ok: true, json: async () => mockCacheStats };
      }
      if (url.includes('/api/usage/breakdown')) {
        return { ok: true, json: async () => mockBreakdown };
      }
      return { ok: false, status: 404 };
    });

    renderAnalytics();

    // Verify title and header
    expect(screen.getByRole('heading', { name: /Consumer Analytics/i })).toBeInTheDocument();

    // Wait for data load
    await waitFor(() => {
      expect(screen.getByText('Prompt Cache Efficiency')).toBeInTheDocument();
    });

    // Check circular gauge and efficiency badge (>70% is High Efficiency)
    expect(screen.getAllByText('77.0%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('⚡ High Efficiency')).toBeInTheDocument();

    // Check KPI Cards
    expect(screen.getByText('Overall Hit Rate')).toBeInTheDocument();
    expect(screen.getAllByText('Cached Tokens').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Total Tokens Consumed')).toBeInTheDocument();
    expect(screen.getByText('Estimated Cache Savings')).toBeInTheDocument();

    // Check formatted token volumes
    expect(screen.getAllByText('1.54 B').length).toBeGreaterThanOrEqual(1);

    // Check Token Composition
    expect(screen.getByText('Token Composition')).toBeInTheDocument();
    expect(screen.getByText('Cached Prompt')).toBeInTheDocument();
    expect(screen.getByText('Uncached Prompt')).toBeInTheDocument();
    expect(screen.getByText('Completion')).toBeInTheDocument();

    // Check Model Cache Performance Table
    expect(screen.getByText('Model Cache Performance')).toBeInTheDocument();
    expect(screen.getByText('cp/cline-pass/deepseek-v4-flash')).toBeInTheDocument();
    expect(screen.getByText('openai/gpt-4o')).toBeInTheDocument();

    // Check Provider Breakdown Section
    expect(screen.getByText('Provider Consumption Breakdown')).toBeInTheDocument();
    expect(screen.getAllByText(/cline-pass/i).length).toBeGreaterThanOrEqual(1);
  }, 10000);

  it('switches time range and triggers refetch', async () => {
    mockApiFetch.mockImplementation(async () => {
      return { ok: true, json: async () => mockCacheStats };
    });

    renderAnalytics();

    await waitFor(() => {
      expect(screen.getAllByText('77.0%').length).toBeGreaterThanOrEqual(1);
    });

    // Click 7d range
    const btn7d = screen.getByRole('button', { name: '7d' });
    fireEvent.click(btn7d);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('range=7d'));
    });
  }, 10000);

  it('displays cold cache status when hit rate is under 40%', async () => {
    const coldStats = {
      ...mockCacheStats,
      totals: {
        ...mockCacheStats.totals,
        hitRate: 0.25,
      },
    };

    mockApiFetch.mockImplementation(async (url) => {
      if (url.includes('/api/usage/cache-stats')) {
        return { ok: true, json: async () => coldStats };
      }
      return { ok: true, json: async () => ({}) };
    });

    renderAnalytics();

    await waitFor(() => {
      expect(screen.getAllByText('25.0%').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('🌱 Cold Cache')).toBeInTheDocument();
    });
  }, 10000);

  it('handles API errors gracefully and supports retry', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Network offline'));

    renderAnalytics();

    await waitFor(() => {
      expect(screen.getByText(/Network offline/i)).toBeInTheDocument();
    });

    // Click retry with working mock
    mockApiFetch.mockImplementation(async () => ({
      ok: true,
      json: async () => mockCacheStats,
    }));

    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.getAllByText('77.0%').length).toBeGreaterThanOrEqual(1);
    });
  }, 10000);
});
