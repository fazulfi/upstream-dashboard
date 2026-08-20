import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { getSessionToken, isApiEnabled, setSessionToken } from './useApi.jsx';
import { parseFrame, useReliabilityStream } from './useReliabilityStream.js';

describe('reliability stream contract', () => {
  beforeEach(() => {
    setSessionToken('stream-token');
  });

  it('expires the session on an authenticated SSE 401 response', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false }));

    const { result } = renderHook(() => useReliabilityStream());

    await waitFor(() => expect(result.current.status).toBe('auth-required'));
    expect(getSessionToken()).toBe('');
    expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'session-expired',
      detail: { message: 'Sesi berakhir. Silakan masuk kembali.' },
    }));
  });

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

  it('returns raw data when the event payload is not JSON', () => {
    expect(parseFrame('event: notice\ndata: service unavailable\n')).toEqual({
      id: '', event: 'notice', data: 'service unavailable', payload: 'service unavailable',
    });
  });
});
