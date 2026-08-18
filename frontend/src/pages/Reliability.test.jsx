import { describe, expect, it } from 'vitest';
import { responseMeta, unwrap } from '../lib/reliabilityApi';

describe('reliability page data contract adapters', () => {
  it('supports documented envelopes and preserves metadata', () => {
    expect(unwrap({ data: { stale: true }, meta: { cursor: 'c-1' } })).toEqual({ stale: true });
    expect(unwrap({ result: { last_event_id: 'evt-1' } })).toEqual({ last_event_id: 'evt-1' });
    expect(responseMeta({ data: {}, meta: { cursor: 'c-1' } })).toEqual({ cursor: 'c-1' });
  });
});
