import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  Zap,
  TrendingDown,
  TrendingUp,
  Activity,
  Layers,
  CheckCircle2,
  Database,
  CreditCard,
  Minus,
} from 'lucide-react';
import KpiCard from './KpiCard';
import Sparkline from './Sparkline';

describe('KpiCard Adversarial & Stress Testing', () => {
  describe('Prop Variations: deltaDir & featured matrix', () => {
    it('handles featured=true with deltaDir=up', () => {
      const { container } = render(
        <KpiCard
          label="Featured Up"
          value="100"
          delta="+10%"
          deltaDir="up"
          featured={true}
          icon={TrendingUp}
        />
      );
      expect(screen.getByText('Featured Up')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('+10%')).toBeInTheDocument();
      expect(container.firstChild).toHaveClass('border-sky-500/40');
      // Verify delta icon exists
      expect(container.querySelector('svg.lucide-arrow-up-right')).toBeInTheDocument();
    });

    it('handles featured=true with deltaDir=down without crashing', () => {
      const { container } = render(
        <KpiCard
          label="Featured Down"
          value="50"
          delta="-25%"
          deltaDir="down"
          featured={true}
          icon={TrendingDown}
        />
      );
      expect(screen.getByText('Featured Down')).toBeInTheDocument();
      expect(screen.getByText('50')).toBeInTheDocument();
      expect(screen.getByText('-25%')).toBeInTheDocument();
      expect(container.firstChild).toHaveClass('border-sky-500/40');
      expect(container.querySelector('svg.lucide-arrow-down-right')).toBeInTheDocument();
    });

    it('handles featured=true with deltaDir=neutral', () => {
      const { container } = render(
        <KpiCard
          label="Featured Neutral"
          value="0"
          delta="0.0%"
          deltaDir="neutral"
          featured={true}
        />
      );
      expect(screen.getByText('Featured Neutral')).toBeInTheDocument();
      expect(container.querySelector('svg.lucide-minus')).toBeInTheDocument();
    });

    it('handles featured=false with deltaDir=neutral as default', () => {
      const { container } = render(
        <KpiCard
          label="Neutral Default"
          value="Normal"
          delta="Flat"
        />
      );
      expect(screen.getByText('Neutral Default')).toBeInTheDocument();
      expect(screen.getByText('Flat')).toBeInTheDocument();
      expect(container.querySelector('svg.lucide-minus')).toBeInTheDocument();
      expect(container.firstChild).not.toHaveClass('border-sky-500/40');
    });

    it('handles unexpected deltaDir value gracefully', () => {
      const { container } = render(
        <KpiCard
          label="Invalid deltaDir"
          value="Test"
          delta="Sideways"
          deltaDir="unknown_direction"
        />
      );
      expect(screen.getByText('Sideways')).toBeInTheDocument();
      // Falls back to Minus icon
      expect(container.querySelector('svg.lucide-minus')).toBeInTheDocument();
    });
  });

  describe('Prop Variations: Custom Classes & Icons', () => {
    it('appends custom classNames correctly without overriding glass styles', () => {
      const { container } = render(
        <KpiCard
          label="Custom Styled"
          value="999"
          className="custom-grid-span col-span-2 shadow-amber-500/10"
        />
      );
      expect(container.firstChild).toHaveClass('custom-grid-span');
      expect(container.firstChild).toHaveClass('col-span-2');
      expect(container.firstChild).toHaveClass('ios-glass-card');
    });

    it('renders with various Lucide icons correctly', () => {
      const icons = [Zap, Layers, CheckCircle2, Database, CreditCard, Activity];
      icons.forEach((IconComp, idx) => {
        const { unmount } = render(
          <KpiCard
            label={`Icon Test ${idx}`}
            value={idx * 10}
            icon={IconComp}
          />
        );
        expect(screen.getByText(`Icon Test ${idx}`)).toBeInTheDocument();
        unmount();
      });
    });

    it('renders with custom React functional icon component', () => {
      const CustomIcon = ({ size, className }) => (
        <svg data-testid="custom-svg-icon" width={size} height={size} className={className}>
          <circle cx="5" cy="5" r="5" fill="red" />
        </svg>
      );
      render(
        <KpiCard
          label="Custom Icon Metric"
          value="Active"
          icon={CustomIcon}
        />
      );
      expect(screen.getByTestId('custom-svg-icon')).toBeInTheDocument();
    });

    it('renders cleanly without icon when icon prop is omitted or null', () => {
      const { container } = render(
        <KpiCard
          label="No Icon Metric"
          value="Clean"
          icon={null}
        />
      );
      expect(screen.getByText('No Icon Metric')).toBeInTheDocument();
      expect(container.querySelector('.lucide')).not.toBeInTheDocument();
    });
  });

  describe('Edge Cases: Value, Label, and Subtitle Variations', () => {
    it('handles numeric 0 value correctly (not falsy replaced by fallback dash)', () => {
      render(<KpiCard label="Zero Value" value={0} />);
      expect(screen.getByText('Zero Value')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('handles negative numeric values and currency strings', () => {
      render(
        <KpiCard
          label="Loss Metric"
          value="-$12,450.00"
          sub="Impairment Q3"
          delta="-8.2%"
          deltaDir="down"
        />
      );
      expect(screen.getByText('Loss Metric')).toBeInTheDocument();
      expect(screen.getByText('-$12,450.00')).toBeInTheDocument();
      expect(screen.getByText('Impairment Q3')).toBeInTheDocument();
    });

    it('handles JSX elements as label, value, sub, and delta', () => {
      render(
        <KpiCard
          label={<span data-testid="jsx-label">Custom Label Node</span>}
          value={<strong data-testid="jsx-value">Custom Value Node</strong>}
          sub={<em data-testid="jsx-sub">Custom Sub Node</em>}
          delta={<span data-testid="jsx-delta">Custom Delta Node</span>}
          deltaDir="up"
        />
      );
      expect(screen.getByTestId('jsx-label')).toHaveTextContent('Custom Label Node');
      expect(screen.getByTestId('jsx-value')).toHaveTextContent('Custom Value Node');
      expect(screen.getByTestId('jsx-sub')).toHaveTextContent('Custom Sub Node');
      expect(screen.getByTestId('jsx-delta')).toHaveTextContent('Custom Delta Node');
    });

    it('handles undefined/null sub and delta gracefully', () => {
      const { container } = render(
        <KpiCard
          label="Minimal Metric"
          value="Simple"
          sub={undefined}
          delta={undefined}
        />
      );
      expect(screen.getByText('Minimal Metric')).toBeInTheDocument();
      expect(screen.getByText('Simple')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument(); // sub fallback is '—'
    });
  });

  describe('Edge Cases: Sparkline Arrays in KpiCard', () => {
    it('handles flat datasets (all identical values) without NaN or zero division in SVG points', () => {
      const { container } = render(
        <KpiCard
          label="Flat Sparkline"
          value="Constant"
          sparkline={[50, 50, 50, 50, 50]}
        />
      );
      const polyline = container.querySelector('polyline');
      expect(polyline).toBeInTheDocument();
      const points = polyline.getAttribute('points');
      expect(points).not.toBeNull();
      expect(points).not.toContain('NaN');
      expect(points).not.toContain('Infinity');
    });

    it('handles 2-point minimal datasets', () => {
      const { container } = render(
        <KpiCard
          label="Two Points"
          value="Minimal"
          sparkline={[10, 20]}
        />
      );
      const polyline = container.querySelector('polyline');
      expect(polyline).toBeInTheDocument();
      expect(polyline.getAttribute('points')).not.toContain('NaN');
    });

    it('gracefully handles empty array or single-point sparkline without crashing', () => {
      const { container: c1 } = render(
        <KpiCard label="Empty Spark" value="None" sparkline={[]} />
      );
      expect(c1.querySelector('polyline')).not.toBeInTheDocument();

      const { container: c2 } = render(
        <KpiCard label="Single Spark" value="One" sparkline={[42]} />
      );
      expect(c2.querySelector('polyline')).not.toBeInTheDocument();
    });

    it('handles negative and floating values in sparkline', () => {
      const { container } = render(
        <KpiCard
          label="Negative Spark"
          value="Oscillating"
          sparkline={[-10.5, 0.25, -5.8, 12.4, -3.1]}
        />
      );
      const polyline = container.querySelector('polyline');
      expect(polyline).toBeInTheDocument();
      const points = polyline.getAttribute('points');
      expect(points).not.toContain('NaN');
      expect(points).not.toContain('Infinity');
    });

    it('generates unique linearGradient IDs for multiple cards to avoid ID collisions', () => {
      const { container } = render(
        <div>
          <KpiCard label="Card 1" value="1" />
          <KpiCard label="Card 2" value="2" />
          <KpiCard label="Card 3" value="3" />
        </div>
      );
      const gradients = container.querySelectorAll('linearGradient');
      const ids = Array.from(gradients).map((g) => g.getAttribute('id'));
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});

describe('Sparkline Component Adversarial & Stress Testing', () => {
  it('handles null/undefined data by rendering empty placeholder container', () => {
    const { container: c1 } = render(<Sparkline data={null} height={40} width={150} />);
    const empty1 = c1.querySelector('.sparkline.empty');
    expect(empty1).toBeInTheDocument();
    expect(empty1).toHaveStyle({ height: '40px', width: '150px' });

    const { container: c2 } = render(<Sparkline data={undefined} />);
    expect(c2.querySelector('.sparkline.empty')).toBeInTheDocument();
  });

  it('handles large series (e.g. 200 data points) with step downsampling', () => {
    const largeData = Array.from({ length: 200 }, (_, i) => Math.sin(i / 10) * 50 + 50);
    const { container } = render(
      <Sparkline data={largeData} color="#10b981" height={40} width={180} />
    );

    const svg = container.querySelector('svg.sparkline');
    expect(svg).toBeInTheDocument();
    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
    const points = polyline.getAttribute('points');
    expect(points).not.toContain('NaN');
    expect(points).not.toContain('Infinity');
  });

  it('renders custom CSS color variables without error', () => {
    const { container } = render(
      <Sparkline data={[1, 5, 2, 8, 3]} color="var(--color-primary)" />
    );
    const polyline = container.querySelector('polyline');
    expect(polyline).toHaveAttribute('stroke', 'var(--color-primary)');
  });

  it('merges custom className onto svg and empty containers', () => {
    const { container: c1 } = render(
      <Sparkline data={[10, 20, 30]} className="custom-spark-class" />
    );
    expect(c1.querySelector('svg')).toHaveClass('custom-spark-class');

    const { container: c2 } = render(
      <Sparkline data={[]} className="custom-empty-class" />
    );
    expect(c2.querySelector('div')).toHaveClass('custom-empty-class');
  });

  it('ensures distinct gradient IDs across multiple standalone Sparklines', () => {
    const { container } = render(
      <div>
        <Sparkline data={[1, 2, 3]} />
        <Sparkline data={[4, 5, 6]} />
      </div>
    );
    const gradients = container.querySelectorAll('linearGradient');
    const ids = Array.from(gradients).map((g) => g.getAttribute('id'));
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
