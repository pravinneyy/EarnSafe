import { request, setAuthToken } from '../http';

// ── Registration ──────────────────────────────────────────────────────────
export async function registerUser(body) {
  const session = await request('/users/register', { method: 'POST', body });
  if (session?.access_token) {
    setAuthToken(session.access_token);
  }
  return session;
}

// ── Firebase Phone Auth (primary login) ───────────────────────────────────
/**
 * Exchange a Firebase Phone Auth ID token for an EarnSafe JWT.
 * Call this after the user has verified their phone via Firebase on the client.
 */
export async function loginWithFirebase(firebaseToken) {
  const session = await request('/auth/firebase', {
    method: 'POST',
    body: { firebase_token: firebaseToken },
  });
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

// ── Session ───────────────────────────────────────────────────────────────

/** Returns full user profile from JWT — used for session restore on app start */
export async function getMe() {
  return request('/users/me');
}

/** Returns wallet { id, user_id, balance, updated_at } */
export async function getWallet() {
  return request('/users/wallet');
}
