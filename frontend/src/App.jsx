import React, { Component } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './theme';
import { ToastProvider } from './components/Toast';
import Layout from './components/Layout';
import LoginGate from './components/LoginGate';
import Reliability from './pages/Reliability';
import Analytics from './pages/Analytics';
import Logs from './pages/Logs';
import Finance from './pages/Finance';
import Settings from './pages/Settings';
import AutoPricing from './pages/AutoPricing';
import PricingPage from './components/PricingPage';
import { useApi } from './hooks/useApi';

function PricingRoute() {
  const { data, loading, error, reload } = useApi('/api/pricing', 30000);
  return (
    <PricingPage
      globals={data?.globals}
      overrides={data?.overrides}
      orderbook={data?.orderbook}
      loading={loading}
      error={error}
      onChanged={reload}
    />
  );
}

export default function App({ appChildren } = {}) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ErrBoundary>
          {appChildren || (
            <HashRouter>
              <Routes>
                <Route
                  element={
                    <LoginGate>
                      <Layout />
                    </LoginGate>
                  }
                >
                  <Route path="/" element={<Reliability />} />
                  <Route path="/analytics" element={<Analytics />} />
                  <Route path="/logs" element={<Logs />} />
                  <Route path="/finance" element={<Finance />} />
                  <Route path="/auto-pricing" element={<AutoPricing />} />
                  <Route path="/pricing" element={<PricingRoute />} />
                  <Route path="/settings" element={<Settings />} />
                </Route>
              </Routes>
            </HashRouter>
          )}
        </ErrBoundary>
      </ToastProvider>
    </ThemeProvider>
  );
}

export class ErrBoundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 24, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <h3>Render error</h3>
          <pre style={{ color: '#e5484d' }}>
            {String(
              this.state.err && (this.state.err.stack || this.state.err.message || this.state.err)
            )}
          </pre>
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() =>
                navigator.clipboard?.writeText(
                  String(this.state.err?.stack || this.state.err?.message || this.state.err)
                )
              }
              style={{
                padding: '6px 12px',
                borderRadius: 6,
                background: '#27272a',
                color: '#ededed',
                border: '1px solid #3f3f46',
                cursor: 'pointer',
              }}
            >
              Copy Error Trace
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
