import { NativeModules, Platform } from 'react-native';

const DEFAULT_PORT = '8000';
const PRODUCTION_API_BASE_URL = 'https://earnsafe-backend.onrender.com';
const INVALID_CLIENT_HOSTS = new Set(['0.0.0.0', '127.0.0.0', '127.0.0.1', 'localhost', '::1']);
let cachedApiBaseUrl = null;

function getLocalDevHost() {
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
}

function getReachableDevHost() {
  const bundlerHost = getBundlerHost();
  if (bundlerHost && !INVALID_CLIENT_HOSTS.has(bundlerHost)) {
    return bundlerHost;
  }
  return getLocalDevHost();
}

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function normalizeBaseUrl(value) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = stripTrailingSlash(trimmed);

  try {
    const url = new URL(normalized);
    if (INVALID_CLIENT_HOSTS.has(url.hostname)) {
      url.hostname = getReachableDevHost();
    }
    return stripTrailingSlash(url.toString());
  } catch {
    return normalized;
  }
}

function getBundlerHost() {
  const scriptURL = NativeModules.SourceCode?.scriptURL;
  if (!scriptURL) {
    return null;
  }

  const match = scriptURL.match(/https?:\/\/([^/:]+)/i);
  return match?.[1] || null;
}

export function getApiBaseUrl() {
  if (cachedApiBaseUrl) {
    return cachedApiBaseUrl;
  }

  const explicitBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
  if (explicitBaseUrl) {
    cachedApiBaseUrl = explicitBaseUrl;
    return cachedApiBaseUrl;
  }

  // Always use the Render backend, even in local dev mode
  cachedApiBaseUrl = PRODUCTION_API_BASE_URL;
  return cachedApiBaseUrl;
}

export function getSimulationWebSocketUrl() {
  const apiBaseUrl = getApiBaseUrl();
  try {
    const url = new URL(apiBaseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws/simulation';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return `${apiBaseUrl.replace(/^http/i, match => (match.toLowerCase() === 'https' ? 'wss' : 'ws'))}/ws/simulation`;
  }
}
