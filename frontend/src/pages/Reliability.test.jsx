import { describe, expect, it } from 'vitest';
import { responseMeta, unwrap } from '../lib/reliabilityApi';

describe('reliability page data contract adapters', () => {
  it('supports documented envelopes and preserves metadata', () => {
    expect(unwrap({ data: { stale: true }, meta: { cursor: 'c-1' } })).toEqual({ stale: true });
    expect(unwrap({ result: { last_event_id: 'evt-1' } })).toEqual({ last_event_id: 'evt-1' });
    expect(responseMeta({ data: {}, meta: { cursor: 'c-1' } })).toEqual({ cursor: 'c-1' });
  });

  it('passes through object-shaped summary without a data key', () => {
    const summary = { armed: true, service_status: 'healthy', last_heartbeat: '2026-08-18T19:22:02Z', model_count: 38, aggregates: [] };
    expect(unwrap(summary)).toEqual(summary);
    expect(unwrap(summary).armed).toBe(true);
    expect(unwrap(summary).model_count).toBe(38);
  });
});
