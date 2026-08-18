import { useCallback, useEffect, useRef, useState } from 'react';
import { getSessionToken } from './useApi.jsx';

const API = import.meta.env.VITE_API_URL || '';
const INITIAL_DELAY = 1000;
const MAX_DELAY = 30000;
const CURSOR_KEY = 'reliability_stream_last_event_id';

export function parseFrame(frame) {
  const event = { data: [], id: '', event: 'message' };
  for (const line of frame.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const separator = line.indexOf(':');
    const field = separator < 0 ? line : line.slice(0, separator);
    const raw = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '');
    if (field === 'id') event.id = raw;
    if (field === 'event') event.event = raw || 'message';
    if (field === 'data') event.data.push(raw);
  }
  if (!event.data.length) return null;
  const data = event.data.join('\n');
  try { return { ...event, data, payload: JSON.parse(data) }; } catch { return { ...event, data, payload: data }; }
}

function readCursor() {
  try { return sessionStorage.getItem(CURSOR_KEY) || ''; } catch { return ''; }
}

function saveCursor(cursor) {
  if (!cursor) return;
  try { sessionStorage.setItem(CURSOR_KEY, cursor); } catch {}
}

export function useReliabilityStream(onEvent, recover) {
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState(null);
  const abortRef = useRef(null);
  const retryTimerRef = useRef(null);
  const delayRef = useRef(INITIAL_DELAY);
  const cursorRef = useRef(readCursor());
  const mountedRef = useRef(true);
  const onEventRef = useRef(onEvent);
  const recoverRef = useRef(recover);
  onEventRef.current = onEvent;
  recoverRef.current = recover;

  const connect = useCallback(async () => {
    if (!mountedRef.current) return;
    const token = getSessionToken();
    if (!token) { setStatus('auth-required'); return; }
    abortRef.current?.abort();
    if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus('connecting');
    try {
      const headers = { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' };
      if (cursorRef.current) headers['Last-Event-ID'] = cursorRef.current;
      const response = await fetch(`${API}/api/reliability/stream`, { headers, signal: controller.signal });
      if (response.status === 401 || response.status === 403) { setStatus('auth-required'); return; }
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      delayRef.current = INITIAL_DELAY;
      setStatus('recovering'); setError(null);
      await recoverRef.current?.();
      if (controller.signal.aborted) return;
      setStatus('live');
      const reader = response.body.getReader();
      const decoder = new TextDecoder(); let buffer = '';
      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/); buffer = frames.pop() || '';
        for (const frame of frames) {
          const event = parseFrame(frame);
          if (event) { if (event.id) { cursorRef.current = event.id; saveCursor(event.id); } onEventRef.current?.(event); }
        }
        if (done) break;
      }
      if (!controller.signal.aborted) throw new Error('stream ended');
    } catch (err) {
      if (controller.signal.aborted || !mountedRef.current) return;
      setError(err.message); setStatus('reconnecting');
      const delay = delayRef.current;
      delayRef.current = Math.min(delay * 2, MAX_DELAY);
      retryTimerRef.current = window.setTimeout(() => { retryTimerRef.current = null; connect(); }, delay);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => { mountedRef.current = false; abortRef.current?.abort(); if (retryTimerRef.current) clearTimeout(retryTimerRef.current); };
  }, [connect]);
  return { status, error, reconnect: connect, cursor: cursorRef.current };
}
