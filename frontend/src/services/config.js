import { NativeModules, Platform } from 'react-native';

const DEFAULT_PORT = '8000';
const INVALID_CLIENT_HOSTS = new Set(['0.0.0.0', '127.0.0.0']);
const LAN_FALLBACK_HOST = '192.168.1.139';

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
      url.hostname = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
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
  const explicitBaseUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL);
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  const bundlerHost = getBundlerHost();
  if (bundlerHost) {
    return `http://${bundlerHost}:${DEFAULT_PORT}`;
  }

  if (Platform.OS === 'android') {
    return `http://${LAN_FALLBACK_HOST}:${DEFAULT_PORT}`;
  }

  return `http://${LAN_FALLBACK_HOST}:${DEFAULT_PORT}`;
}
