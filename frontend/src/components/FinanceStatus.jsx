import React from 'react';

export default function FinanceStatus({ metrics = [], variance = '' }) {
  return (
    <section className="finance-status" aria-label="Finance status">
      <h3>Status Metrik (decision-grade)</h3>
      <ul className="finance-metrics">
        {metrics.map((m) => (
          <li key={m.key} className={`metric metric-${m.verified ? 'verified' : 'pending'}`}>
            <span className="metric-label">{m.label}</span>
            <span className="metric-value">{m.value}</span>
            <span className={`badge badge-${m.verified ? 'verified' : 'pending'}`}>
              {m.verified ? '✓ verified' : 'pending'}
            </span>
          </li>
        ))}
      </ul>
      {variance ? <p className="finance-variance">{variance}</p> : null}
    </section>
  );
}
