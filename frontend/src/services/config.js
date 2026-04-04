import { NativeModules, Platform } from 'react-native';

const DEFAULT_PORT = '8000';
const PRODUCTION_API_BASE_URL = 'https://earnsafe-backend.onrender.com';
const INVALID_CLIENT_HOSTS = new Set(['0.0.0.0', '127.0.0.0', '127.0.0.1', 'localhost', '::1']);
let cachedApiBaseUrl = null;

function getLocalDevHost() {
  return Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
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
      url.hostname = getLocalDevHost();
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

  if (__DEV__) {
    const bundlerHost = getBundlerHost();
    if (bundlerHost) {
      cachedApiBaseUrl = `http://${bundlerHost}:${DEFAULT_PORT}`;
      return cachedApiBaseUrl;
    }

    cachedApiBaseUrl = `http://${getLocalDevHost()}:${DEFAULT_PORT}`;
    return cachedApiBaseUrl;
  }

  cachedApiBaseUrl = PRODUCTION_API_BASE_URL;
  return cachedApiBaseUrl;
}
