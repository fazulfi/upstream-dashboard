import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ModelDetailDrawer, { isDrawerSwipeClose } from './ModelDetailDrawer';
import { ToastProvider } from './Toast';

const sampleModel = {
  model_id: 'deepseek/deepseek-v3',
  slug: 'codebuddy-cn',
  our_price: 0.08,
  competitor_price: 0.10,
  action: 'HOLD',
  freshness: '1s ago',
};

function renderDrawer(props = {}) {
  return render(
    <ToastProvider>
      <ModelDetailDrawer
        model={sampleModel}
        isOpen={true}
        onClose={vi.fn()}
        onUpdated={vi.fn()}
        {...props}
      />
    </ToastProvider>
  );
}

describe('ModelDetailDrawer', () => {
  it('does not render content when isOpen is false', () => {
    renderDrawer({ isOpen: false });
    expect(screen.queryByText('deepseek/deepseek-v3')).not.toBeInTheDocument();
  });

  it('renders model economics and details when isOpen is true', () => {
    renderDrawer({ isOpen: true });
    expect(screen.getByText('deepseek/deepseek-v3')).toBeInTheDocument();
    expect(screen.getByText('$0.0800')).toBeInTheDocument();
    expect(screen.getByText('$0.1000')).toBeInTheDocument();
    expect(screen.getAllByText('codebuddy-cn').length).toBeGreaterThanOrEqual(1);
  });

  it('calls onClose when close button, Close Inspector, or backdrop is clicked', () => {
    const onClose = vi.fn();
    renderDrawer({ isOpen: true, onClose });
    
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const closeInspectorBtn = screen.getByRole('button', { name: 'Close Inspector' });
    fireEvent.click(closeInspectorBtn);
    expect(onClose).toHaveBeenCalledTimes(2);

    const backdrop = document.querySelector('.bg-black\\/60');
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(3);
    }
  });

  it('renders the drag handle for swipe-to-close', () => {
    renderDrawer({ isOpen: true });
    const handle = document.querySelector('.ios-sheet-handle');
    expect(handle).toBeInTheDocument();
    expect(handle).toHaveAttribute('aria-label', 'Drag handle');
  });

  it('closes when Escape key is pressed while open', () => {
    const onClose = vi.fn();
    renderDrawer({ isOpen: true, onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('submits manual ask price and triggers onUpdated', async () => {
    const onUpdated = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    renderDrawer({ isOpen: true, onUpdated });
    const askInput = screen.getByPlaceholderText('$0.0800');
    fireEvent.change(askInput, { target: { value: '0.0850' } });

    const saveAskBtn = screen.getByRole('button', { name: 'Save Ask' });
    fireEvent.click(saveAskBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/ask',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            upstream_slug: 'codebuddy-cn',
            upstream_catalog_model_id: 'deepseek/deepseek-v3',
            ask_input_per_mtok: 0.085,
            ask_output_per_mtok: 0.085,
          }),
        })
      );
      expect(onUpdated).toHaveBeenCalled();
    });
  });

  it('submits auto-pricing trigger and triggers onUpdated', async () => {
    const onUpdated = vi.fn();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    renderDrawer({ isOpen: true, onUpdated });
    const triggerInput = screen.getByPlaceholderText('10 (default)');
    fireEvent.change(triggerInput, { target: { value: '15' } });

    const saveTriggerBtn = screen.getByRole('button', { name: 'Update %' });
    fireEvent.click(saveTriggerBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/auto-pricing/config',
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({
            upstream: 'codebuddy-cn',
            model_id: 'deepseek-v3',
            trigger_pct: 15,
          }),
        })
      );
      expect(onUpdated).toHaveBeenCalled();
    });
  });

  it('validates ask and trigger inputs before submitting', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    renderDrawer({ isOpen: true });
    const saveAskBtn = screen.getByRole('button', { name: 'Save Ask' });
    const saveTriggerBtn = screen.getByRole('button', { name: 'Update %' });

    // Both buttons should be disabled when empty
    expect(saveAskBtn).toBeDisabled();
    expect(saveTriggerBtn).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('handles partial/empty model metadata without errors', () => {
    renderDrawer({
      isOpen: true,
      model: {
        model_id: 'bare-model',
      },
    });
    expect(screen.getByRole('heading', { name: 'bare-model' })).toBeInTheDocument();
    expect(screen.getByText('HOLD')).toBeInTheDocument();
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('handles API error during ask price submission cleanly', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Database locked' }),
    });

    renderDrawer({ isOpen: true });
    const askInput = screen.getByPlaceholderText('$0.0800');
    fireEvent.change(askInput, { target: { value: '0.0900' } });

    const saveAskBtn = screen.getByRole('button', { name: 'Save Ask' });
    fireEvent.click(saveAskBtn);

    await waitFor(() => {
      expect(screen.getByText('Database locked')).toBeInTheDocument();
    });
  });

  it('renders with ios-sheet container and grab handle when open', () => {
    const { container } = renderDrawer({ isOpen: true });
    const sheet = container.querySelector('.ios-sheet');
    expect(sheet).toBeInTheDocument();
    const handle = container.querySelector('.ios-sheet-handle');
    expect(handle).toBeInTheDocument();
    expect(handle).toHaveClass('touch-none');
  });

  describe('isDrawerSwipeClose swipe gesture thresholds', () => {
    it('evaluates downward distance threshold (> 100)', () => {
      expect(isDrawerSwipeClose({ offset: { y: 101 }, velocity: { y: 0 } })).toBe(true);
      expect(isDrawerSwipeClose({ offset: { y: 100 }, velocity: { y: 0 } })).toBe(false);
      expect(isDrawerSwipeClose({ offset: { y: 50 }, velocity: { y: 0 } })).toBe(false);
      expect(isDrawerSwipeClose({ offset: { y: -50 }, velocity: { y: 0 } })).toBe(false);
    });

    it('evaluates downward flick velocity threshold (> 500)', () => {
      expect(isDrawerSwipeClose({ offset: { y: 0 }, velocity: { y: 501 } })).toBe(true);
      expect(isDrawerSwipeClose({ offset: { y: 0 }, velocity: { y: 500 } })).toBe(false);
      expect(isDrawerSwipeClose({ offset: { y: 0 }, velocity: { y: 200 } })).toBe(false);
      expect(isDrawerSwipeClose({ offset: { y: 0 }, velocity: { y: -300 } })).toBe(false);
    });

    it('handles undefined or partial info safely without throwing', () => {
      expect(isDrawerSwipeClose(undefined)).toBe(false);
      expect(isDrawerSwipeClose(null)).toBe(false);
      expect(isDrawerSwipeClose({})).toBe(false);
      expect(isDrawerSwipeClose({ offset: {} })).toBe(false);
      expect(isDrawerSwipeClose({ velocity: {} })).toBe(false);
    });
  });

  it('submits model budget spend caps via PUT /api/budgets/{modelId}', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const onUpdated = vi.fn();
    renderDrawer({ isOpen: true, onUpdated });

    const maxInput = screen.getByPlaceholderText('e.g. 2.5000');
    const maxOutput = screen.getByPlaceholderText('e.g. 10.0000');

    fireEvent.change(maxInput, { target: { value: '2.50' } });
    fireEvent.change(maxOutput, { target: { value: '10.00' } });

    const saveBudgetBtn = screen.getByRole('button', { name: 'Save Budget Caps' });
    fireEvent.click(saveBudgetBtn);

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/budgets/deepseek/deepseek-v3',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            max_input_per_mtok: 2.5,
            max_output_per_mtok: 10,
            min_discount_pct: null,
            enabled: true,
          }),
        })
      );
      expect(onUpdated).toHaveBeenCalled();
    });
  });
});
