export default function Badge({ kind = 'ok', children }) {
  const map = {
    ok: 'ok', active: 'ok',
    drained: 'warn', warning: 'warn',
    invalid: 'bad', error: 'bad', off: 'bad',
    neutral: 'neutral',
  };
  const cls = map[kind] || 'neutral';
  return <span className={`badge badge-${cls}`}>{children}</span>;
}
