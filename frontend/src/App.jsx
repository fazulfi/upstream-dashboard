import React, { Component } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './theme';
import Layout from './components/Layout';
import LoginGate from './components/LoginGate';
import Reliability from './pages/Reliability';
import Settings from './pages/Settings';
import Asks from './pages/Asks';
import AutoPricing from './pages/AutoPricing';

export default function App({ appChildren } = {}) {
  return (
    <ThemeProvider>
      <ErrBoundary>
        {appChildren || <HashRouter>
          <Routes>
            <Route element={<LoginGate><Layout /></LoginGate>}>
              <Route path="/" element={<Reliability />} />
              <Route path="/asks" element={<Asks />} />
              <Route path="/auto-pricing" element={<AutoPricing />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </HashRouter>}
      </ErrBoundary>
    </ThemeProvider>
  );
}

export class ErrBoundary extends Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (this.state.err) {
      return <div style={{ padding: 24, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
        <h3>Render error</h3>
        <pre style={{ color: '#e5484d' }}>{String(this.state.err && (this.state.err.stack || this.state.err.message || this.state.err))}</pre>
      </div>;
    }
    return this.props.children;
  }
}
