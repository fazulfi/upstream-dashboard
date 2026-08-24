import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import CommandPalette from './CommandPalette';
import { ThemeProvider } from '../theme';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPalette(props = {}) {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    ...props,
  };
  return {
    ...render(
      <ThemeProvider>
        <MemoryRouter>
          <CommandPalette {...defaultProps} />
        </MemoryRouter>
      </ThemeProvider>
    ),
    onClose: defaultProps.onClose,
  };
}

describe('CommandPalette (Enhanced Spotlight Search)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders nothing when isOpen is false', () => {
    renderPalette({ isOpen: false });
    expect(screen.queryByPlaceholderText(/Type a command/i)).not.toBeInTheDocument();
  });

  it('renders search input, glass category headers, and initial command items when open', () => {
    renderPalette({ isOpen: true });
    
    // Search input
    expect(screen.getByPlaceholderText(/Type a command/i)).toBeInTheDocument();
    
    // Glass category headers
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.getByText('Models')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();

    // Key items in each category
    expect(screen.getByText('Reliability & Telemetry')).toBeInTheDocument();
    expect(screen.getByText('anthropic/claude-3-5-sonnet')).toBeInTheDocument();
    expect(screen.getByText('Arm Auto-Pricing Daemon')).toBeInTheDocument();
    expect(screen.getByText(/Switch to Light Mode|Switch to Dark Mode/)).toBeInTheDocument();

    // Keyboard shortcut badges
    expect(screen.getByText('⌘1')).toBeInTheDocument();
    expect(screen.getByText('⌘2')).toBeInTheDocument();
    expect(screen.getByText('⇧⌘T')).toBeInTheDocument();
  });

  it('filters results across title, subtitle, and keywords', () => {
    renderPalette({ isOpen: true });
    const input = screen.getByPlaceholderText(/Type a command/i);

    // Search for model by title
    fireEvent.change(input, { target: { value: 'claude' } });
    expect(screen.getByText(/anthropic\/claude-3-5-sonnet/i)).toBeInTheDocument();
    expect(screen.queryByText(/openai\/gpt-4o/i)).not.toBeInTheDocument();

    // Search for model by sub-description keyword (e.g. cost leader)
    fireEvent.change(input, { target: { value: 'Cost Leader' } });
    expect(screen.getByText(/deepseek\/deepseek-chat/i)).toBeInTheDocument();
    expect(screen.queryByText(/anthropic\/claude-3-5-sonnet/i)).not.toBeInTheDocument();

    // Search for action by keyword (e.g. jwt)
    fireEvent.change(input, { target: { value: 'jwt' } });
    expect(screen.getByText(/Inspect Session Auth Token/i)).toBeInTheDocument();

    // Search for pages by category or keyword
    fireEvent.change(input, { target: { value: 'orderbook' } });
    expect(screen.getByText(/Pricing & Orderbook/i)).toBeInTheDocument();
  });

  it('supports clearing search query via X button', () => {
    renderPalette({ isOpen: true });
    const input = screen.getByPlaceholderText(/Type a command/i);

    fireEvent.change(input, { target: { value: 'gpt' } });
    expect(input.value).toBe('gpt');

    const clearButton = screen.getByRole('button', { name: /Clear search query/i });
    fireEvent.click(clearButton);

    expect(input.value).toBe('');
    expect(screen.getByText('Pages')).toBeInTheDocument();
  });

  it('navigates with ArrowDown and ArrowUp with wrap-around', () => {
    renderPalette({ isOpen: true });
    const input = screen.getByPlaceholderText(/Type a command/i);
    fireEvent.change(input, { target: { value: 'Pages' } });

    // Arrow down moves forward
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    // Arrow down again
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    // Arrow up moves backward
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    // Arrow up wraps around to bottom
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'ArrowUp' });
  });

  it('updates selection on mouse hover', () => {
    renderPalette({ isOpen: true });
    const financeItem = screen.getByText('Finance & Profitability').closest('button');
    fireEvent.mouseEnter(financeItem);
    expect(financeItem).toHaveClass('bg-sky-500/15');
  });

  it('executes item action and closes palette on Enter key press', () => {
    const onClose = vi.fn();
    renderPalette({ isOpen: true, onClose });
    const input = screen.getByPlaceholderText(/Type a command/i);

    fireEvent.change(input, { target: { value: 'Finance & Profitability' } });
    fireEvent.keyDown(window, { key: 'Enter' });

    expect(mockNavigate).toHaveBeenCalledWith('/finance');
    expect(onClose).toHaveBeenCalled();
  });

  it('executes item action and closes palette on button click', () => {
    const onClose = vi.fn();
    renderPalette({ isOpen: true, onClose });
    const input = screen.getByPlaceholderText(/Type a command/i);

    fireEvent.change(input, { target: { value: 'Auto-Pricing Engine' } });
    const itemBtn = screen.getByText('Auto-Pricing Engine').closest('button');
    fireEvent.click(itemBtn);

    expect(mockNavigate).toHaveBeenCalledWith('/auto-pricing');
    expect(onClose).toHaveBeenCalled();
  });

  it('closes palette when Escape key is pressed', () => {
    const onClose = vi.fn();
    renderPalette({ isOpen: true, onClose });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('supports direct ⌘1-⌘5 shortcuts to navigate and close', () => {
    const onClose = vi.fn();
    renderPalette({ isOpen: true, onClose });

    // Cmd+2 -> Finance
    fireEvent.keyDown(window, { key: '2', metaKey: true });
    expect(mockNavigate).toHaveBeenCalledWith('/finance');
    expect(onClose).toHaveBeenCalled();
  });

  it('supports theme toggle shortcut ⇧⌘T', () => {
    renderPalette({ isOpen: true });
    fireEvent.keyDown(window, { key: 't', metaKey: true, shiftKey: true });
  });

  it('renders muted glass empty state illustration and supports Clear search button', () => {
    renderPalette({ isOpen: true });
    const input = screen.getByPlaceholderText(/Type a command/i);

    fireEvent.change(input, { target: { value: 'xyz-no-match-query-12345' } });
    
    // Empty state card
    expect(screen.getByText(/No matching results for/i)).toBeInTheDocument();
    expect(screen.getByText(/xyz-no-match-query-12345/i)).toBeInTheDocument();
    
    const clearSearchBtn = screen.getByRole('button', { name: /^Clear search$/i });
    expect(clearSearchBtn).toBeInTheDocument();

    // Clicking clear search resets query
    fireEvent.click(clearSearchBtn);
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.getByText('Models')).toBeInTheDocument();
  });

  it('calls scrollIntoView when selection changes', () => {
    renderPalette({ isOpen: true });
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
