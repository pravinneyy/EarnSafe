import { request, setAuthToken } from '../http';

export async function registerUser(body) {
  const session = await request('/users/register', { method: 'POST', body });
  if (session?.access_token) {
    setAuthToken(session.access_token);
  }
  return session;
}

export async function loginUser(body) {
  const session = await request('/users/login', { method: 'POST', body });
  if (session?.access_token) {
    setAuthToken(session.access_token);
  }
  return session;
}

export async function loginWithPhone(phone, otp) {
  const session = await request('/auth/phone-login', {
    method: 'POST',
    body: { phone, otp },
  });
  if (session?.access_token) {
    setAuthToken(session.access_token);
  }
  return session;
}

export function clearSession() {
  setAuthToken(null);
}

export async function getMe() {
  return request('/users/me');
}

export async function getWallet() {
  return request('/users/wallet');
}

export async function getWalletSummary() {
  return request('/users/wallet/summary');
}
