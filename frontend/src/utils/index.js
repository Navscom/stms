const API = import.meta.env.VITE_API_URL || (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://127.0.0.1:8000';
  }
  return `http://${host}:8000`;
})();

async function fetchJson(path, options) {
  const shouldRetry = !options || !options.method || options.method.toUpperCase() === 'GET';
  const maxAttempts = shouldRetry ? 3 : 1;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${API}${path}`, options);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.detail || `Server error: ${response.status}`);
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw lastError;
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }

  throw lastError;
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

export function updatePinComment(pinId, commentId, payload, meta = {}) {
  return fetchJson(`/danger-pins/${pinId}/comments/${commentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      requesting_user_id: meta.requesting_user_id ?? null,
      requesting_role: meta.requesting_role,
    }),
  });
}

export function deletePinComment(pinId, commentId, meta = {}) {
  const params = new URLSearchParams();
  if (meta.requesting_user_id) params.append('requesting_user_id', String(meta.requesting_user_id));
  if (meta.requesting_role) params.append('requesting_role', meta.requesting_role);
  const query = params.toString();
  return fetchJson(`/danger-pins/${pinId}/comments/${commentId}${query ? `?${query}` : ''}`, {
    method: 'DELETE',
  });
}

export function deleteDangerPin(pinId, meta = {}) {
  const params = new URLSearchParams();
  if (meta.requesting_user_id) params.append('requesting_user_id', String(meta.requesting_user_id));
  if (meta.requesting_role) params.append('requesting_role', meta.requesting_role);
  const query = params.toString();
  return fetchJson(`/danger-pins/${pinId}${query ? `?${query}` : ''}`, {
    method: 'DELETE',
  });
}

export function deleteDestination(destinationId) {
  return fetchJson(`/destinations/${destinationId}`, {
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
