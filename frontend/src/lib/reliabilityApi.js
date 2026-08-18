import { apiFetch } from '../hooks/useApi.jsx';

const json = async (response) => {
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
};

const boundedParams = (params = {}) => {
  const next = { ...params };
  if (next.limit != null) next.limit = Math.min(Math.max(Number(next.limit) || 1, 1), 50);
  return next;
};

export const reliabilityApi = {
  summary: () => apiFetch('/api/reliability/summary').then(json),
  cycles: (params = {}) => apiFetch(`/api/reliability/cycles?${new URLSearchParams(boundedParams(params))}`).then(json),
  events: (params = {}) => apiFetch(`/api/reliability/events?${new URLSearchParams(boundedParams(params))}`).then(json),
  models: (params = {}) => apiFetch(`/api/reliability/models?${new URLSearchParams(boundedParams(params))}`).then(json),
  transition: (state) => {
    if (state !== 'arm' && state !== 'disarm') throw new Error('Invalid reliability transition');
    return apiFetch(`/api/reliability/${state}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(json);
  },
};

export function unwrap(payload) {
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
  if (payload && Object.prototype.hasOwnProperty.call(payload, 'result')) return payload.result;
  return payload ?? {};
}

export function responseMeta(payload) {
  return payload?.meta || {};
}
