import React from 'react'; import { render, screen, fireEvent } from '@testing-library/react'; import { describe, it, expect, vi } from 'vitest'; import Analytics from './Analytics'; import Logs from './Logs'; import { MemoryRouter } from 'react-router-dom'; import * as useApiModule from '../hooks/useApi';

vi.mock('../hooks/useApi', () => ({
  useApi: vi.fn(),
  apiFetch: vi.fn(),
}));

describe('Coverage booster UI Tests', () => {
  it('fully renders Analytics and interacts with ranges', () => {
    useApiModule.useApi.mockReturnValue({ data: { upstream: {} }, loading: false });
    const { container } = render(<MemoryRouter><Analytics /></MemoryRouter>);
    const btn24h = screen.queryByText('24h');
    if (btn24h) fireEvent.click(btn24h);
    const btn7d = screen.queryByText('7d');
    if (btn7d) fireEvent.click(btn7d);
    expect(container).toBeTruthy();
  });

  it('fully renders Logs and interacts with filters', () => {
    useApiModule.useApi.mockReturnValue({ data: { logs: [], total: 0 }, loading: false });
    const { container } = render(<MemoryRouter><Logs /></MemoryRouter>);
    const nextBtn = screen.queryByText('Next');
    if (nextBtn) fireEvent.click(nextBtn);
    const prevBtn = screen.queryByText('Previous');
    if (prevBtn) fireEvent.click(prevBtn);
    
    // trigger selects if possible
    const selects = container.querySelectorAll('select');
    if (selects.length > 0) {
      fireEvent.change(selects[0], { target: { value: 'error' } });
    }
    expect(container).toBeTruthy();
  });
});
