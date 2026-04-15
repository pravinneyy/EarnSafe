import { getApiBaseUrl } from './config';

const REQUEST_TIMEOUT_MS = 10000;
const RETRY_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRIES = 2;
let authToken = null;
let globalErrorHandler = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function setAuthToken(token) {
  authToken = token || null;
  if (typeof globalThis?.localStorage !== 'undefined') {
    if (authToken) {
      globalThis.localStorage.setItem('authToken', authToken);
    } else {
      globalThis.localStorage.removeItem('authToken');
    }
  }
}

export function getAuthToken() {
  if (authToken) {
    return authToken;
  }
  if (typeof globalThis?.localStorage !== 'undefined') {
    authToken = globalThis.localStorage.getItem('authToken');
  }
  return authToken;
}

export function setGlobalErrorHandler(handler) {
  globalErrorHandler = handler;
}

function formatApiErrorDetail(detail) {
  if (typeof detail === 'string') {
    return detail;
  }

  if (Array.isArray(detail)) {
    return detail
      .map(item => {
        const path = Array.isArray(item?.loc)
          ? item.loc.filter(part => part !== 'body').join('.')
          : '';
        const fieldLabel = path || 'request';
        return item?.msg ? `${fieldLabel}: ${item.msg}` : JSON.stringify(item);
      })
      .join('\n');
  }

  if (detail && typeof detail === 'object') {
    return detail.message || JSON.stringify(detail);
  }

  return null;
}

export async function request(path, options = {}) {
  const { method = 'GET', body, headers = {}, timeoutMs = REQUEST_TIMEOUT_MS, retries = MAX_RETRIES } = options;
  const url = `${getApiBaseUrl()}${path}`;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const token = getAuthToken();
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
        const isRetryable = RETRY_STATUS_CODES.has(response.status) && attempt < retries;
        if (response.status === 401) {
          setAuthToken(null);
        }
        if (isRetryable) {
          await sleep(250 * (attempt + 1));
          continue;
        }
        let errMsg = `Request failed with status ${response.status}`;
        if (payload?.detail) {
          errMsg = formatApiErrorDetail(payload.detail) || errMsg;
        }
        const error = new Error(errMsg);
        error.status = response.status;
        error.payload = payload;
        if (globalErrorHandler) {
          globalErrorHandler(error);
        }
        throw error;
      }

      return payload;
    } catch (error) {
      if (error?.name === 'AbortError') {
        const timeoutError = new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Please try again.`);
        if (globalErrorHandler) {
          globalErrorHandler(timeoutError);
        }
        throw timeoutError;
      }

      if (error instanceof TypeError && attempt < retries) {
        await sleep(250 * (attempt + 1));
        continue;
      }

      if (error instanceof TypeError) {
        const networkError = new Error(
          `Unable to reach the API at ${getApiBaseUrl()}. Verify that the backend URL is correct and the service is reachable.`
        );
        if (globalErrorHandler) {
          globalErrorHandler(networkError);
        }
        throw networkError;
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
