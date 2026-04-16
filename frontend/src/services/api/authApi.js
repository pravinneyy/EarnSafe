import { request, setAuthToken } from '../http';

// ── Registration (still used for new users) ───────────────────────────────
export async function registerUser(body) {
  const session = await request('/users/register', { method: 'POST', body });
  if (session?.access_token) {
    setAuthToken(session.access_token);
  }
  return session;
}

// ── Legacy username/password login (secondary method) ────────────────────
export async function loginUser(body) {
  const session = await request('/users/login', { method: 'POST', body });
  if (session?.access_token) {
    setAuthToken(session.access_token);
  }
  return session;
}

// ── OTP: primary login flow ───────────────────────────────────────────────

/** Step 1 — request a 6-digit OTP to be sent to phone */
export async function sendOtp(phone) {
  return request('/auth/otp/send', {
    method: 'POST',
    body: { phone },
  });
}

/** Step 2 — verify OTP; returns JWT session on success */
export async function verifyOtp(phone, otp) {
  const session = await request('/auth/otp/verify', {
    method: 'POST',
    body: { phone, otp },
  });
  if (session?.access_token) {
    setAuthToken(session.access_token);
  }
  return session;
}

// ── Session ───────────────────────────────────────────────────────────────

/** Returns full user profile from JWT — used for session restore on app start */
export async function getMe() {
  return request('/users/me');
}

/** Returns wallet { id, user_id, balance, updated_at } */
export async function getWallet() {
  return request('/users/wallet');
}
