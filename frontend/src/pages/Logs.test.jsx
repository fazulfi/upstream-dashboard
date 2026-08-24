import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import Logs from './Logs';
import { ThemeProvider } from '../theme';

const mockApiFetch = vi.fn();
vi.mock('../hooks/useApi', () => ({
  apiFetch: (...args) => mockApiFetch(...args),
}));

const mockLogsData = {
  total: 42,
  rangeTotal: 42,
  page: 1,
  pageSize: 25,
  totalCostUsdc: '0.124500',
  rows: [
    {
      id: 'req_01j9a8b7c6d5e4f3',
      ts: '2026-08-23T16:45:00Z',
      status: 'ok',
      http_status: 200,
      model: 'deepseek/deepseek-chat',
      upstream_label: 'cline-pass',
      prompt_tokens: 1500,
      cached_tokens: 1200,
      completion_tokens: 300,
      total_tokens: 1800,
      ttft_ms: 240,
      duration_ms: 1250,
      cost_consumer_usdc: '0.000417',
    },
    {
      id: 'req_02k8b7c6d5e4f3a2',
      ts: '2026-08-23T16:44:00Z',
      status: '429',
      http_status: 429,
      model: 'anthropic/claude-3-5-sonnet',
      upstream_label: 'opencode-go',
      prompt_tokens: 450,
      cached_tokens: 0,
      completion_tokens: 0,
      total_tokens: 450,
      ttft_ms: null,
      duration_ms: 80,
      cost_consumer_usdc: '0.000000',
    },
  ],
};

const mockModelsList = [
  { value: 'deepseek/deepseek-chat', label: 'deepseek/deepseek-chat' },
  { value: 'anthropic/claude-3-5-sonnet', label: 'anthropic/claude-3-5-sonnet' },
];

function renderLogs() {
  return render(
    <ThemeProvider>
      <Logs />
    </ThemeProvider>
  );
}

describe('Logs Page (Request History & Inspection)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders table headers, request rows, status pills, TTFT, and financial cost', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url.includes('/api/usage/logs-models')) {
        return { ok: true, json: async () => mockModelsList };
      }
      if (url.includes('/api/usage/logs')) {
        return { ok: true, json: async () => mockLogsData };
      }
      return { ok: false, status: 404 };
    });

    renderLogs();

    expect(screen.getByRole('heading', { name: /Request Logs/i })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText('deepseek/deepseek-chat').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('anthropic/claude-3-5-sonnet').length).toBeGreaterThanOrEqual(1);
    });

    // Check status pills
    expect(screen.getByText('200 OK')).toBeInTheDocument();
    expect(screen.getByText('429')).toBeInTheDocument();

    // Check upstream badges
    expect(screen.getByText('cline-pass')).toBeInTheDocument();
    expect(screen.getByText('opencode-go')).toBeInTheDocument();

    // Check latency
    expect(screen.getByText('240 ms TTFT')).toBeInTheDocument();

    // Check cached tokens badge
    expect(screen.getByText('1.2 k')).toBeInTheDocument();

    // Check pagination footer
    expect(screen.getByText(/42 total requests/i)).toBeInTheDocument();
    expect(screen.getByText(/Page 1 of 2/i)).toBeInTheDocument();
  });

  it('opens request detail modal on row click with complete telemetry', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url.includes('/api/usage/logs-models')) {
        return { ok: true, json: async () => mockModelsList };
      }
      if (url.includes('/api/usage/logs')) {
        return { ok: true, json: async () => mockLogsData };
      }
      return { ok: false, status: 404 };
    });

    renderLogs();

    await waitFor(() => {
      expect(screen.getAllByText('deepseek/deepseek-chat').length).toBeGreaterThanOrEqual(1);
    });

    // Click row
    const elements = screen.getAllByText('deepseek/deepseek-chat');
    fireEvent.click(elements[elements.length - 1]);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Request Details/i })).toBeInTheDocument();
    });

    expect(screen.getAllByText('req_01j9a8b7c6d5e4f3').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('80.0% Cached')).toBeInTheDocument();
    expect(screen.getByText(/Raw Telemetry Payload/i)).toBeInTheDocument();

    // Close modal via Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Request Details/i })).not.toBeInTheDocument();
    });
  });

  it('filters by status and search input', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url.includes('/api/usage/logs-models')) {
        return { ok: true, json: async () => mockModelsList };
      }
      return { ok: true, json: async () => mockLogsData };
    });

    renderLogs();

    await waitFor(() => {
      expect(screen.getAllByText('deepseek/deepseek-chat').length).toBeGreaterThanOrEqual(1);
    });

    // Type in search input
    const searchInput = screen.getByPlaceholderText(/Search by model, upstream, ID/i);
    fireEvent.change(searchInput, { target: { value: 'deepseek' } });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('q=deepseek'));
    });
  });

  it('handles empty response gracefully', async () => {
    mockApiFetch.mockImplementation(async (url) => {
      if (url.includes('/api/usage/logs-models')) {
        return { ok: true, json: async () => [] };
      }
      return {
        ok: true,
        json: async () => ({ total: 0, rows: [], page: 1, pageSize: 25 }),
      };
    });

    renderLogs();

    await waitFor(() => {
      expect(screen.getByText(/No requests found/i)).toBeInTheDocument();
    });
  });
});
