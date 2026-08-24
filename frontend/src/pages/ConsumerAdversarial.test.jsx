import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Analytics from './Analytics';
import Logs from './Logs';
import { ThemeProvider } from '../theme';

const mockApiFetch = vi.fn();
vi.mock('../hooks/useApi', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

function renderWithTheme(ui) {
  return render(
    <ThemeProvider>
      {ui}
    </ThemeProvider>
  );
}

describe('Consumer Features Adversarial & Stress Testing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Analytics.jsx Adversarial Edge Cases', () => {
    it('handles zero tokens, empty totals, and zero-division without NaN% or runtime crash', async () => {
      const zeroStats = {
        range: '24h',
        totals: {
          reqs: 0,
          promptTokens: 0,
          cachedTokens: 0,
          cacheWriteTokens: 0,
          hitRate: 0,
          estimatedSavingsUsdc: '0.00',
        },
        rows: [],
      };

      const emptyBreakdown = {
        range: '24h',
        byModel: [],
        byProvider: [],
      };

      mockApiFetch.mockImplementation(async (url) => {
        if (url.includes('/api/usage/cache-stats')) {
          return { ok: true, json: async () => zeroStats };
        }
        if (url.includes('/api/usage/breakdown')) {
          return { ok: true, json: async () => emptyBreakdown };
        }
        return { ok: false, status: 404 };
      });

      renderWithTheme(<Analytics />);

      await waitFor(() => {
        expect(screen.getByText('Prompt Cache Efficiency')).toBeInTheDocument();
      });

      // Gauge and KPI should display 0.0% cleanly, not NaN%
      expect(screen.getAllByText('0.0%').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('🌱 Cold Cache')).toBeInTheDocument();
      expect(screen.getByText(/Low cache reuse detected/i)).toBeInTheDocument();
    }, 10000);

    it('handles extreme large token volumes (billions) and formatted savings without overflow', async () => {
      const massiveStats = {
        range: '30d',
        totals: {
          reqs: 15000000,
          promptTokens: 25000000000,
          cachedTokens: 21000000000,
          cacheWriteTokens: 500000000,
          hitRate: 0.84,
          estimatedSavingsUsdc: '10500.75',
        },
        rows: [
          {
            label: 'massive/super-model-v1',
            reqs: 15000000,
            promptTokens: 25000000000,
            cachedTokens: 21000000000,
            cacheWriteTokens: 500000000,
            hitRate: 0.84,
          },
        ],
      };

      mockApiFetch.mockImplementation(async (url) => {
        if (url.includes('/api/usage/cache-stats')) {
          return { ok: true, json: async () => massiveStats };
        }
        return { ok: true, json: async () => ({ range: '30d', byModel: [], byProvider: [] }) };
      });

      renderWithTheme(<Analytics />);

      await waitFor(() => {
        expect(screen.getAllByText('84.0%').length).toBeGreaterThanOrEqual(1);
      });

      expect(screen.getAllByText('21.00 B').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('⚡ High Efficiency')).toBeInTheDocument();
      expect(screen.getByText('massive/super-model-v1')).toBeInTheDocument();
    }, 10000);

    it('handles malformed, null, or missing breakdown payloads gracefully', async () => {
      mockApiFetch.mockImplementation(async (url) => {
        if (url.includes('/api/usage/cache-stats')) {
          return { ok: true, json: async () => ({ totals: null, rows: null }) };
        }
        if (url.includes('/api/usage/breakdown')) {
          return { ok: true, json: async () => ({ byModel: null, byProvider: null }) };
        }
        return { ok: false, status: 500 };
      });

      renderWithTheme(<Analytics />);

      await waitFor(() => {
        expect(screen.getByText('Prompt Cache Efficiency')).toBeInTheDocument();
      });

      expect(screen.getAllByText('0.0%').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/No model cache/i)).toBeInTheDocument();
    }, 10000);
  });

  describe('Logs.jsx Adversarial Edge Cases', () => {
    it('handles micro-precision costs and formats properly with currency prefix', async () => {
      const microLogs = {
        total: 1,
        rangeTotal: 1,
        page: 1,
        pageSize: 25,
        totalCostUsdc: '0.000014',
        rows: [
          {
            id: 'req_micro_01',
            ts: '2026-08-23T12:00:00Z',
            status: 'ok',
            http_status: 200,
            model: 'deepseek/deepseek-coder',
            upstream_label: 'test-upstream',
            prompt_tokens: 10,
            cached_tokens: 0,
            completion_tokens: 2,
            total_tokens: 12,
            ttft_ms: 50,
            duration_ms: 120,
            cost_consumer_usdc: '0.000014',
          },
        ],
      };

      mockApiFetch.mockImplementation(async (url) => {
        if (url.includes('/api/usage/logs-models')) {
          return { ok: true, json: async () => [] };
        }
        if (url.includes('/api/usage/logs')) {
          return { ok: true, json: async () => microLogs };
        }
        return { ok: false, status: 404 };
      });

      renderWithTheme(<Logs />);

      await waitFor(() => {
        expect(screen.getByText('req_micro_01')).toBeInTheDocument();
      });

      // Line 137 expectation: fmtUsdMicro(0.000014) gives '$0.000014'
      expect(screen.getByText('$0.000014')).toBeInTheDocument();
    }, 10000);

    it('handles malformed and null telemetry fields in log entries', async () => {
      const malformedLogs = {
        total: 1,
        rangeTotal: 1,
        page: 1,
        pageSize: 25,
        rows: [
          {
            id: null,
            ts: null,
            status: 200, // numeric status
            http_status: null,
            model: null,
            upstream_label: null,
            prompt_tokens: null,
            cached_tokens: null,
            completion_tokens: null,
            total_tokens: null,
            ttft_ms: null,
            duration_ms: null,
            cost_consumer_usdc: null,
          },
        ],
      };

      mockApiFetch.mockImplementation(async (url) => {
        if (url.includes('/api/usage/logs-models')) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => malformedLogs };
      });

      renderWithTheme(<Logs />);

      await waitFor(() => {
        expect(screen.getByText(/unknown/i)).toBeInTheDocument();
      });

      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    }, 10000);

    it('handles search input with special characters, regex syntax, and scripts safely', async () => {
      const logsWithData = {
        total: 2,
        rangeTotal: 2,
        page: 1,
        pageSize: 25,
        rows: [
          {
            id: 'req_special_1',
            ts: '2026-08-23T14:00:00Z',
            status: 'ok',
            http_status: 200,
            model: 'model[special*(regex+?^$',
            upstream_label: '<script>alert("test")</script>',
            prompt_tokens: 100,
            cached_tokens: 50,
            completion_tokens: 50,
            total_tokens: 150,
            ttft_ms: 100,
            duration_ms: 300,
            cost_consumer_usdc: '0.001',
          },
        ],
      };

      mockApiFetch.mockImplementation(async (url) => {
        if (url.includes('/api/usage/logs-models')) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => logsWithData };
      });

      renderWithTheme(<Logs />);

      await waitFor(() => {
        expect(screen.getByText('req_special_1')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/Search by model, upstream, ID/i);
      fireEvent.change(searchInput, { target: { value: '[special*(regex+?^$' } });

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('q=%5Bspecial*%28regex%2B%3F%5E%24'));
      });
    }, 10000);

    it('interacts with telemetry modal and cleans up on Escape', async () => {
      const modalLog = {
        total: 1,
        rangeTotal: 1,
        page: 1,
        pageSize: 25,
        rows: [
          {
            id: 'req_modal_test_99',
            ts: '2026-08-23T15:00:00Z',
            status: 'error',
            http_status: 500,
            model: 'test/error-model',
            upstream_label: 'upstream-fail',
            prompt_tokens: 200,
            cached_tokens: 0,
            completion_tokens: 0,
            total_tokens: 200,
            ttft_ms: null,
            duration_ms: 45,
            cost_consumer_usdc: '0.000',
          },
        ],
      };

      mockApiFetch.mockImplementation(async (url) => {
        if (url.includes('/api/usage/logs-models')) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => modalLog };
      });

      renderWithTheme(<Logs />);

      await waitFor(() => {
        expect(screen.getByText('req_modal_test_99')).toBeInTheDocument();
      });

      // Click to open modal
      fireEvent.click(screen.getByText('req_modal_test_99'));

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /Request Details/i })).toBeInTheDocument();
      });

      expect(screen.getByText(/Raw Telemetry Payload/i)).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: /Request Details/i })).not.toBeInTheDocument();
      }, { timeout: 4000 });
    }, 10000);

    it('generates large datasets and supports pagination bounds without crashes', async () => {
      const massiveRows = Array.from({ length: 50 }, (_, i) => ({
        id: `req_${i}`,
        ts: '2026-08-23T16:00:00Z',
        status: i % 5 === 0 ? '429' : 'ok',
        http_status: i % 5 === 0 ? 429 : 200,
        model: `model_${i}`,
        upstream_label: `upstream_${i % 3}`,
        prompt_tokens: 1000 + i,
        cached_tokens: 500 + i,
        completion_tokens: 200 + i,
        total_tokens: 1700 + (2 * i),
        ttft_ms: 150 + i,
        duration_ms: 500 + i,
        cost_consumer_usdc: '0.002500',
      }));

      const largeDataset = {
        total: 100,
        rangeTotal: 100,
        page: 1,
        pageSize: 50,
        totalCostUsdc: '0.250000',
        rows: massiveRows,
      };

      mockApiFetch.mockImplementation(async (url) => {
        if (url.includes('/api/usage/logs-models')) {
          return { ok: true, json: async () => [] };
        }
        return { ok: true, json: async () => largeDataset };
      });

      renderWithTheme(<Logs />);

      await waitFor(() => {
        expect(screen.getByText('req_0')).toBeInTheDocument();
        expect(screen.getByText('req_49')).toBeInTheDocument();
      });

      expect(screen.getByText(/100 total requests/i)).toBeInTheDocument();
      expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
    }, 10000);
  });
});
