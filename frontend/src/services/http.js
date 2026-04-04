import { getApiBaseUrl } from './config';

const REQUEST_TIMEOUT_MS = 10000;

export async function request(path, options = {}) {
  const { method = 'GET', body, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS } = options;
  const url = `${getApiBaseUrl()}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json')
      ? await response.json()
      : null;

    if (!response.ok) {
      let errMsg = `Request failed with status ${response.status}`;
      if (payload?.detail) {
        errMsg = typeof payload.detail === 'string' ? payload.detail : JSON.stringify(payload.detail);
      }
      throw new Error(errMsg);
    }

    return payload;
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`);
    }

    if (error instanceof TypeError) {
      throw new Error(
        `Unable to reach the API at ${getApiBaseUrl()}. Verify that the backend URL is correct and the service is reachable.`
      );
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
