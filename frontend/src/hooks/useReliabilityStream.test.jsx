import { describe, expect, it } from 'vitest';
import { isApiEnabled } from './useApi.jsx';
import { parseFrame } from './useReliabilityStream.js';

describe('reliability stream contract', () => {
  it('allows reliability paths without allowing unrelated paths', () => {
    expect(isApiEnabled('/api/reliability/summary')).toBe(true);
    expect(isApiEnabled('/api/reliability/stream')).toBe(true);
    expect(isApiEnabled('/api/reliability/arm')).toBe(true);
    expect(isApiEnabled('/api/market')).toBe(false);
  });

  it('parses event id, type, multiline data, and ignores keepalive comments', () => {
    expect(parseFrame(': keepalive\r\nid: cursor-7\r\nevent: cycle\r\ndata: {"cycle_id":"c-1",\r\ndata: "status":"completed"}\r\n')).toEqual({
      id: 'cursor-7', event: 'cycle', data: '{"cycle_id":"c-1",\n"status":"completed"}', payload: { cycle_id: 'c-1', status: 'completed' },
    });
  });

  it('does not invent a payload for comment-only frames', () => {
    expect(parseFrame(': keepalive\n')).toBeNull();
  });
});
