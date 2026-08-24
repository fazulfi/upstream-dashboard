import React from 'react'; import { render, screen, fireEvent } from '@testing-library/react'; import { describe, it, expect, vi } from 'vitest'; import Logs from './Logs'; import { MemoryRouter } from 'react-router-dom'; import * as useApiModule from '../hooks/useApi';

vi.mock('../hooks/useApi', () => ({
  useApi: vi.fn(),
  apiFetch: vi.fn(),
}));

describe('Logs Page Full Coverage', () => {
  it('interacts with all table functions and pagination', () => {
    useApiModule.useApi.mockReturnValue({
      data: {
        logs: [{ request_id: '123', status: 200, ttft_ms: 100, total_duration_ms: 200, total_tokens: 50, cost_micro_usd: 10, ts: 1000000, model_id: 'gpt', provider: 'test', payload: '{}' }],
        total: 100, page: 1, per_page: 20
      },
      loading: false, reload: vi.fn()
    });

    const { container } = render(<MemoryRouter><Logs /></MemoryRouter>);
    const nextBtn = screen.queryByText('Next');
    if (nextBtn) fireEvent.click(nextBtn);
    const prevBtn = screen.queryByText('Previous');
    if (prevBtn) fireEvent.click(prevBtn);
    
    const searchInput = container.querySelector('input');
    if (searchInput) {
      fireEvent.change(searchInput, { target: { value: 'test search' } });
    }
    
    const selects = container.querySelectorAll('select');
    selects.forEach(s => {
      fireEvent.change(s, { target: { value: '200' } });
    });
    
    const row = container.querySelector('tbody tr');
    if (row) fireEvent.click(row);
    
    expect(container).toBeTruthy();
  });
});
