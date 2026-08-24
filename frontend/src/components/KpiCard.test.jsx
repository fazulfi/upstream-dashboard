import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Zap, TrendingDown } from 'lucide-react';
import KpiCard from './KpiCard';

describe('KpiCard Component', () => {
  it('renders standard label, value, sub, and default sparkline', () => {
    render(
      <KpiCard
        label="Net Profit"
        value="$1,450.75"
        sub="Total Revenue - Costs"
      />
    );

    expect(screen.getByText('Net Profit')).toBeInTheDocument();
    expect(screen.getByText('$1,450.75')).toBeInTheDocument();
    expect(screen.getByText('Total Revenue - Costs')).toBeInTheDocument();
  });

  it('renders fallback dash when value is null or undefined', () => {
    render(<KpiCard label="Empty Metric" value={null} sub="Context details" />);
    expect(screen.getByText('Empty Metric')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByText('Context details')).toBeInTheDocument();
  });

  it('renders upward delta badge with directional indicator', () => {
    render(
      <KpiCard
        label="Uptime"
        value="99.99%"
        delta="+0.05%"
        deltaDir="up"
        icon={Zap}
      />
    );

    expect(screen.getByText('Uptime')).toBeInTheDocument();
    expect(screen.getByText('+0.05%')).toBeInTheDocument();
  });

  it('renders downward delta badge with rose styling and icon', () => {
    render(
      <KpiCard
        label="Latency"
        value="42ms"
        delta="-12ms"
        deltaDir="down"
        icon={TrendingDown}
      />
    );

    expect(screen.getByText('Latency')).toBeInTheDocument();
    expect(screen.getByText('-12ms')).toBeInTheDocument();
  });

  it('renders featured state with glowing border and accent styling', () => {
    const { container } = render(
      <KpiCard
        label="Daemon Status"
        value="ARMED"
        featured
        icon={Zap}
      />
    );

    expect(screen.getByText('ARMED')).toBeInTheDocument();
    expect(container.firstChild).toHaveClass('border-sky-500/40');
  });

  it('renders custom sparkline points without errors', () => {
    const { container } = render(
      <KpiCard
        label="Traffic"
        value="1.2M"
        sparkline={[10, 20, 15, 30, 45, 40, 60]}
      />
    );

    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
    expect(polyline).toHaveAttribute('points');
  });
});
