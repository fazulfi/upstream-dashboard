import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import Sparkline from './Sparkline';

describe('Sparkline Component', () => {
  it('renders empty fallback when data is missing or empty', () => {
    const { container } = render(<Sparkline data={[]} />);
    expect(container.querySelector('.sparkline.empty')).toBeInTheDocument();
  });

  it('renders empty fallback when data has only 1 point', () => {
    const { container } = render(<Sparkline data={[42]} />);
    expect(container.querySelector('.sparkline.empty')).toBeInTheDocument();
  });

  it('renders SVG polyline and gradient volume polygon for numeric series', () => {
    const { container } = render(
      <Sparkline data={[10, 25, 18, 40, 32, 50]} color="#0ea5e9" height={32} width={120} />
    );

    const svg = container.querySelector('svg.sparkline');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('width', '120');
    expect(svg).toHaveAttribute('height', '32');

    const polygon = container.querySelector('polygon');
    expect(polygon).toBeInTheDocument();
    expect(polygon).toHaveAttribute('fill');

    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
    expect(polyline).toHaveAttribute('stroke', '#0ea5e9');
  });

  it('handles flat / zero range datasets gracefully without NaN', () => {
    const { container } = render(
      <Sparkline data={[50, 50, 50, 50]} color="#6366f1" />
    );

    const polyline = container.querySelector('polyline');
    expect(polyline).toBeInTheDocument();
    expect(polyline.getAttribute('points')).not.toContain('NaN');
  });
});
