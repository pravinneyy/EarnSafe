import { getApiBaseUrl } from './config';

export async function request(path, options = {}) {
  const { method = 'GET', body, headers = {} } = options;
  const url = `${getApiBaseUrl()}${path}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
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
    if (error instanceof TypeError) {
      throw new Error(
        `Unable to reach the API at ${getApiBaseUrl()}. Verify that the backend URL is correct and the service is reachable.`
      );
    }

    throw error;
  }
}
