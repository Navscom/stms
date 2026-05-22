const API = 'http://127.0.0.1:8000';

async function fetchJson(path, options) {
  const response = await fetch(`${API}${path}`, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail || 'Server error.');
  }
  return payload;
}

export function getDestinations() {
  return fetchJson('/destinations');
}

export function getDangerPins() {
  return fetchJson('/danger-pins');
}

export function getReportSummary() {
  return fetchJson('/reports/summary');
}

export function getSafetyCheck(lat, lng) {
  return fetchJson(`/safety-check?lat=${lat}&lng=${lng}`);
}

export function getAiAdvice(lat, lng) {
  return fetchJson(`/ai-advice?lat=${lat}&lng=${lng}`);
}

export function postDangerPin(payload) {
  return fetchJson('/danger-pins', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function postPinComment(pinId, payload) {
  return fetchJson(`/danger-pins/${pinId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function deleteDangerPin(pinId) {
  return fetchJson(`/danger-pins/${pinId}`, {
    method: 'DELETE',
  });
}

export function deleteAccount(email) {
  return fetchJson('/delete-account', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
}

export { API };
