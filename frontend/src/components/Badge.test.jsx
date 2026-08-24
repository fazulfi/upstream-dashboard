import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from './Badge';

describe('Badge Component', () => {
  it('renders children with default ok styling using sky palette', () => {
    render(<Badge>Active Status</Badge>);
    const badge = screen.getByText('Active Status');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('ios-badge');
    expect(badge).toHaveClass('bg-sky-500/15');
  });

  it('renders dot pulse indicator when dot is true', () => {
    const { container } = render(<Badge dot kind="ok">Healthy</Badge>);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    const dot = container.querySelector('.animate-pulse');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass('bg-sky-500');
  });

  it('renders warning variant with amber styling', () => {
    render(<Badge kind="warn">Drained</Badge>);
    const badge = screen.getByText('Drained');
    expect(badge).toHaveClass('bg-amber-500/15');
  });

  it('renders bad/error variant with rose styling', () => {
    render(<Badge kind="error">Failed</Badge>);
    const badge = screen.getByText('Failed');
    expect(badge).toHaveClass('bg-rose-500/15');
  });

  it('renders neutral variant fallback', () => {
    render(<Badge kind="neutral">Neutral State</Badge>);
    const badge = screen.getByText('Neutral State');
    expect(badge).toBeInTheDocument();
  });
});
