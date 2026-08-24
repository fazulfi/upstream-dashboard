import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ContextMenu, { calculateClampedPosition } from './ContextMenu';

describe('calculateClampedPosition helper', () => {
  it('returns exact coordinates when within safe viewport bounds', () => {
    const pos = calculateClampedPosition(150, 200, 1024, 768);
    expect(pos.left).toBe(150);
    expect(pos.top).toBe(200);
  });

  it('clamps coordinates on right edge overflow', () => {
    const pos = calculateClampedPosition(1000, 200, 1024, 768);
    // 1024 - 210 (menuWidth) - 12 (padding) = 802
    expect(pos.left).toBe(802);
    expect(pos.top).toBe(200);
  });

  it('clamps coordinates on bottom edge overflow', () => {
    const pos = calculateClampedPosition(150, 750, 1024, 768);
    // 768 - 150 (menuHeight) - 12 (padding) = 606
    expect(pos.left).toBe(150);
    expect(pos.top).toBe(606);
  });

  it('clamps coordinates on negative left/top inputs to padding', () => {
    const pos = calculateClampedPosition(-50, -30, 1024, 768);
    expect(pos.left).toBe(12);
    expect(pos.top).toBe(12);
  });
});

describe('ContextMenu Component', () => {
  const sampleModel = {
    model_id: 'anthropic/claude-3-5-sonnet',
    slug: 'codebuddy',
    our_price: 0.003,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(
      <ContextMenu
        isOpen={false}
        x={100}
        y={100}
        model={sampleModel}
        onClose={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders menu items and model title when isOpen is true', () => {
    render(
      <ContextMenu
        isOpen={true}
        x={100}
        y={100}
        model={sampleModel}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('anthropic/claude-3-5-sonnet')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /view details/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /copy model id/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /dismiss/i })).toBeInTheDocument();
  });

  it('calls onViewDetails and onClose when View Details is clicked', () => {
    const handleViewDetails = vi.fn();
    const handleClose = vi.fn();

    render(
      <ContextMenu
        isOpen={true}
        x={100}
        y={100}
        model={sampleModel}
        onClose={handleClose}
        onViewDetails={handleViewDetails}
      />
    );

    const viewDetailsBtn = screen.getByRole('menuitem', { name: /view details/i });
    fireEvent.click(viewDetailsBtn);

    expect(handleViewDetails).toHaveBeenCalledTimes(1);
    expect(handleViewDetails).toHaveBeenCalledWith(sampleModel);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('copies model_id to clipboard and triggers onClose when Copy Model ID is clicked', () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    const handleCopyId = vi.fn();
    const handleClose = vi.fn();

    render(
      <ContextMenu
        isOpen={true}
        x={100}
        y={100}
        model={sampleModel}
        onClose={handleClose}
        onCopyId={handleCopyId}
      />
    );

    const copyBtn = screen.getByRole('menuitem', { name: /copy model id/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalledWith('anthropic/claude-3-5-sonnet');
    expect(handleCopyId).toHaveBeenCalledWith(sampleModel);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('handles clipboard copy gracefully when navigator.clipboard is absent', () => {
    const originalClipboard = navigator.clipboard;
    // @ts-ignore
    delete navigator.clipboard;

    const handleClose = vi.fn();
    render(
      <ContextMenu
        isOpen={true}
        x={100}
        y={100}
        model={sampleModel}
        onClose={handleClose}
      />
    );

    const copyBtn = screen.getByRole('menuitem', { name: /copy model id/i });
    expect(() => fireEvent.click(copyBtn)).not.toThrow();
    expect(handleClose).toHaveBeenCalledTimes(1);

    navigator.clipboard = originalClipboard;
  });

  it('calls onClose when Dismiss button is clicked', () => {
    const handleClose = vi.fn();

    render(
      <ContextMenu
        isOpen={true}
        x={100}
        y={100}
        model={sampleModel}
        onClose={handleClose}
      />
    );

    const dismissBtn = screen.getByRole('menuitem', { name: /dismiss/i });
    fireEvent.click(dismissBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();

    render(
      <ContextMenu
        isOpen={true}
        x={100}
        y={100}
        model={sampleModel}
        onClose={handleClose}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking backdrop overlay or onContextMenu on backdrop', () => {
    const handleClose = vi.fn();

    render(
      <ContextMenu
        isOpen={true}
        x={100}
        y={100}
        model={sampleModel}
        onClose={handleClose}
      />
    );

    const backdrop = screen.getByTestId('context-menu-backdrop');
    fireEvent.click(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.contextMenu(backdrop);
    expect(handleClose).toHaveBeenCalledTimes(2);
  });

  it('calls onClose on pointerdown outside menu element', () => {
    const handleClose = vi.fn();

    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <ContextMenu
          isOpen={true}
          x={100}
          y={100}
          model={sampleModel}
          onClose={handleClose}
        />
      </div>
    );

    const outside = screen.getByTestId('outside-area');
    fireEvent.pointerDown(outside);
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('supports target and position prop aliases', () => {
    const handleViewDetails = vi.fn();
    const handleClose = vi.fn();

    render(
      <ContextMenu
        isOpen={true}
        position={{ x: 200, y: 300 }}
        target={{ id: 'deepseek/deepseek-chat' }}
        onClose={handleClose}
        onViewDetails={handleViewDetails}
      />
    );

    expect(screen.getByText('deepseek/deepseek-chat')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /view details/i }));
    expect(handleViewDetails).toHaveBeenCalledWith({ id: 'deepseek/deepseek-chat' });
  });
});
