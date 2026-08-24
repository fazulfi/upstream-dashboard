import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor, waitForElementToBeRemoved } from '@testing-library/react';
import KpiCard from './KpiCard';
import Badge from './Badge';
import { ToastProvider, useToast } from './Toast';

describe('Adversarial & Stress Testing: KpiCard.jsx', () => {
  describe('Extreme & Malformed Values', () => {
    it('handles null, undefined, empty string, and 0 without crash or NaN', () => {
      const { unmount: u1 } = render(<KpiCard label="Null Test" value={null} sub="Sub Context 1" />);
      expect(screen.getByText('Null Test')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
      expect(screen.getByText('Sub Context 1')).toBeInTheDocument();
      u1();

      const { unmount: u2 } = render(<KpiCard label="Undefined Test" value={undefined} sub="Sub Context 2" />);
      expect(screen.getByText('Undefined Test')).toBeInTheDocument();
      expect(screen.getByText('—')).toBeInTheDocument();
      expect(screen.getByText('Sub Context 2')).toBeInTheDocument();
      u2();

      const { unmount: u3 } = render(<KpiCard label="Empty String" value="" sub="Sub Context 3" />);
      expect(screen.getByText('Empty String')).toBeInTheDocument();
      u3();

      const { unmount: u4 } = render(<KpiCard label="Zero Val" value={0} sub="Sub Context 4" />);
      expect(screen.getByText('Zero Val')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
      u4();
    });

    it('handles extreme numeric values: massive numbers, scientific notation, negatives, and Infinity', () => {
      const massiveNumber = 987654321987654321n.toString();
      const { unmount: u1 } = render(<KpiCard label="Massive Num" value={massiveNumber} />);
      expect(screen.getByText(massiveNumber)).toBeInTheDocument();
      u1();

      const { unmount: u2 } = render(<KpiCard label="Sci Notation" value="1.24e+30" />);
      expect(screen.getByText('1.24e+30')).toBeInTheDocument();
      u2();

      const { unmount: u3 } = render(<KpiCard label="Extreme Negative" value="-999,999,999.999" />);
      expect(screen.getByText('-999,999,999.999')).toBeInTheDocument();
      u3();

      const { unmount: u4 } = render(<KpiCard label="Infinity Val" value={Infinity} />);
      expect(screen.getByText('Infinity')).toBeInTheDocument();
      u4();
    });

    it('handles super long uninterrupted strings for label, value, sub, and delta with break-words/truncate layout protection', () => {
      const longString = 'A'.repeat(1000);
      const { container } = render(
        <KpiCard
          label={longString}
          value={longString}
          sub={longString}
          delta={longString}
          deltaDir="up"
        />
      );
      const valueEl = container.querySelector('.text-2xl, .text-3xl, .tabular-nums');
      expect(valueEl).toBeInTheDocument();
      expect(valueEl).toHaveClass('break-words');
    });

    it('handles XSS and special characters safely', () => {
      const xssPayload = '<script>alert("XSS")</script>&<>"\'/\\';
      render(
        <KpiCard
          label={xssPayload}
          value={xssPayload}
          sub={xssPayload}
          delta={xssPayload}
        />
      );
      const elements = screen.getAllByText(xssPayload);
      expect(elements.length).toBeGreaterThan(0);
    });
  });

  describe('Adversarial Sparkline Input Handling', () => {
    it('handles empty, 1-item, null, and non-standard sparkline inputs gracefully', () => {
      const { container: c1 } = render(<KpiCard label="Empty" value="1" sparkline={[]} />);
      expect(c1.querySelector('svg polyline')).not.toBeInTheDocument();

      const { container: c2 } = render(<KpiCard label="Single" value="1" sparkline={[100]} />);
      expect(c2.querySelector('svg polyline')).not.toBeInTheDocument();

      const { container: c3 } = render(<KpiCard label="Null" value="1" sparkline={null} />);
      expect(c3.querySelector('svg polyline')).not.toBeInTheDocument();
    });

    it('handles massive sparkline datasets (10,000 points) without crashing', () => {
      const massiveData = Array.from({ length: 10000 }, (_, i) => Math.sin(i) * 50 + 50);
      const { container } = render(
        <KpiCard label="Big Data" value="10k" sparkline={massiveData} />
      );
      const polyline = container.querySelector('polyline');
      expect(polyline).toBeInTheDocument();
      const points = polyline.getAttribute('points');
      expect(points).not.toContain('NaN');
      expect(points).not.toContain('Infinity');
    });

    it('handles negative sparklines and identical min/max values without divide-by-zero NaN', () => {
      const flatNegative = [-50, -50, -50, -50];
      const { container } = render(
        <KpiCard label="Negative Flat" value="-50" sparkline={flatNegative} />
      );
      const polyline = container.querySelector('polyline');
      expect(polyline).toBeInTheDocument();
      const points = polyline.getAttribute('points');
      expect(points).not.toContain('NaN');
      expect(points).not.toContain('Infinity');
    });
  });

  describe('DeltaDir and Variant Robustness', () => {
    it('handles all deltaDir variants and unknown fallbacks', () => {
      const dirs = ['up', 'down', 'neutral', 'invalid-dir', '', null, undefined];
      dirs.forEach((dir) => {
        const { unmount } = render(
          <KpiCard label="Dir Test" value="123" delta="5%" deltaDir={dir} />
        );
        expect(screen.getByText('5%')).toBeInTheDocument();
        unmount();
      });
    });

    it('switches featured state dynamically without layout artifacts', () => {
      const { rerender, container } = render(
        <KpiCard label="Switch Card" value="100" featured={false} />
      );
      expect(container.firstChild).not.toHaveClass('border-sky-500/40');

      rerender(<KpiCard label="Switch Card" value="100" featured={true} />);
      expect(container.firstChild).toHaveClass('border-sky-500/40');

      rerender(<KpiCard label="Switch Card" value="100" featured={false} />);
      expect(container.firstChild).not.toHaveClass('border-sky-500/40');
    });
  });
});

describe('Adversarial & Stress Testing: Badge.jsx', () => {
  it('handles all standard kinds and arbitrary unknown kinds with neutral fallback', () => {
    const kinds = [
      'ok', 'active', 'live',
      'warn', 'warning', 'drained', 'hold',
      'bad', 'error', 'invalid', 'off',
      'info', 'neutral',
      'non_existent_kind', '', null, undefined, 123
    ];

    kinds.forEach((k) => {
      const { unmount } = render(<Badge kind={k}>Badge-{String(k)}</Badge>);
      expect(screen.getByText(`Badge-${String(k)}`)).toBeInTheDocument();
      unmount();
    });
  });

  it('handles dot=true across all kinds including invalid kind', () => {
    const { container, unmount } = render(<Badge kind="unknown" dot={true}>Dot Fallback</Badge>);
    expect(screen.getByText('Dot Fallback')).toBeInTheDocument();
    const dot = container.querySelector('.animate-pulse');
    expect(dot).toBeInTheDocument();
    expect(dot).toHaveClass('bg-zinc-600');
    unmount();
  });

  it('handles extreme children types: empty, number 0, massive strings, React elements', () => {
    const { unmount: u1 } = render(<Badge>{0}</Badge>);
    expect(screen.getByText('0')).toBeInTheDocument();
    u1();

    const longText = 'Status_'.repeat(200);
    const { unmount: u2 } = render(<Badge>{longText}</Badge>);
    expect(screen.getByText(longText)).toBeInTheDocument();
    u2();

    const { unmount: u3 } = render(
      <Badge>
        <span data-testid="nested-node">Nested Node</span>
      </Badge>
    );
    expect(screen.getByTestId('nested-node')).toBeInTheDocument();
    u3();
  });

  it('supports rapid variant switching without style corruption', () => {
    const { rerender, container } = render(<Badge kind="ok">Dynamic Badge</Badge>);
    expect(container.firstChild).toHaveClass('bg-sky-500/15');

    rerender(<Badge kind="warn">Dynamic Badge</Badge>);
    expect(container.firstChild).toHaveClass('bg-amber-500/15');

    rerender(<Badge kind="error">Dynamic Badge</Badge>);
    expect(container.firstChild).toHaveClass('bg-rose-500/15');

    rerender(<Badge kind="neutral">Dynamic Badge</Badge>);
    expect(container.firstChild).toHaveClass('bg-black/5');
  });
});

describe('Adversarial & Stress Testing: Toast.jsx', () => {
  function TestToastConsumer({ onMount }) {
    const toast = useToast();
    React.useEffect(() => {
      if (onMount) onMount(toast);
    }, [onMount, toast]);

    return (
      <div>
        <button onClick={() => toast.success('Success message')}>Add Success</button>
        <button onClick={() => toast.error('Error message')}>Add Error</button>
        <button onClick={() => toast.warn('Warn message')}>Add Warn</button>
        <button onClick={() => toast.toast('Info message')}>Add Info</button>
      </div>
    );
  }

  it('renders and dismisses toasts cleanly via user interaction', async () => {
    render(
      <ToastProvider>
        <TestToastConsumer />
      </ToastProvider>
    );

    fireEvent.click(screen.getByText('Add Success'));
    expect(screen.getByText('Success message')).toBeInTheDocument();

    const dismissBtn = screen.getByLabelText('Dismiss');
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByText('Success message')).not.toBeInTheDocument();
    });
  });

  it('handles massive burst of toasts without unhandled exception', () => {
    let toastApi;
    render(
      <ToastProvider>
        <TestToastConsumer onMount={(api) => { toastApi = api; }} />
      </ToastProvider>
    );

    act(() => {
      for (let i = 0; i < 50; i++) {
        toastApi.addToast(`Burst Toast #${i}`, i % 2 === 0 ? 'success' : 'error', 0);
      }
    });

    expect(screen.getByText('Burst Toast #0')).toBeInTheDocument();
    expect(screen.getByText('Burst Toast #49')).toBeInTheDocument();
  });

  it('handles extreme toast message content: super long strings, empty strings, and special characters', () => {
    let toastApi;
    render(
      <ToastProvider>
        <TestToastConsumer onMount={(api) => { toastApi = api; }} />
      </ToastProvider>
    );

    const superLongMsg = 'LONG_LOG_ENTRY_'.repeat(100);
    act(() => {
      toastApi.addToast(superLongMsg, 'info', 0);
      toastApi.addToast('', 'warning', 0);
      toastApi.addToast('Special <>&"\'', 'error', 0);
    });

    expect(screen.getByText(superLongMsg)).toBeInTheDocument();
    expect(screen.getByText('Special <>&"\'')).toBeInTheDocument();
  });

  it('auto-dismisses toasts with timers', async () => {
    let toastApi;
    render(
      <ToastProvider>
        <TestToastConsumer onMount={(api) => { toastApi = api; }} />
      </ToastProvider>
    );

    act(() => {
      toastApi.addToast('Timer Toast', 'info', 100);
    });
    expect(screen.getByText('Timer Toast')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Timer Toast')).not.toBeInTheDocument();
    }, { timeout: 2000 });
  });

  it('provides safe no-op fallback when useToast is called outside of ToastProvider', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    function OrphanConsumer() {
      const toast = useToast();
      return (
        <button
          onClick={() => {
            toast.addToast('Orphan');
            toast.success('Orphan Success');
            toast.error('Orphan Error');
            toast.warn('Orphan Warn');
          }}
        >
          Trigger Orphan
        </button>
      );
    }

    render(<OrphanConsumer />);
    fireEvent.click(screen.getByText('Trigger Orphan'));

    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleErrSpy).toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
    consoleErrSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });
});
