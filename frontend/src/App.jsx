import { Component } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './theme';
import Layout from './components/Layout';
import LoginGate from './components/LoginGate';
import Dashboard from './pages/Dashboard';
import Reliability from './pages/Reliability';
import Earnings from './pages/Earnings';
import Upstreams from './pages/Upstreams';
import Pnl from './pages/Pnl';
import Settlements from './pages/Settlements';
import Settings from './pages/Settings';
import Analytics from './pages/Analytics';
import Keys from './pages/Keys';
import Topups from './pages/Topups';
import Market from './pages/Market';
import Catalog from './pages/Catalog';
import Usage from './pages/Usage';
import Asks from './pages/Asks';
import FleetHealth from './pages/FleetHealth';
import AutoPricing from './pages/AutoPricing';
import Budgets from './pages/Budgets';
import Combos from './pages/Combos';

export default function App() {
  return (
    <ThemeProvider>
      <ErrBoundary>
        <HashRouter>
          <Routes>
            <Route element={<LoginGate><Layout /></LoginGate>}>
              <Route path="/" element={<Reliability />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/earnings" element={<Earnings />} />
              <Route path="/upstreams" element={<Upstreams />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/pnl" element={<Pnl />} />
              <Route path="/settlements" element={<Settlements />} />
              <Route path="/keys" element={<Keys />} />
              <Route path="/topups" element={<Topups />} />
              <Route path="/market" element={<Market />} />
              <Route path="/catalog" element={<Catalog />} />
              <Route path="/usage" element={<Usage />} />
              <Route path="/asks" element={<Asks />} />
              <Route path="/budgets" element={<Budgets />} />
              <Route path="/combos" element={<Combos />} />
              <Route path="/fleet-health" element={<FleetHealth />} />
              <Route path="/auto-pricing" element={<AutoPricing />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Routes>
        </HashRouter>
      </ErrBoundary>
    </ThemeProvider>
  );
}

class ErrBoundary extends Component {
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
