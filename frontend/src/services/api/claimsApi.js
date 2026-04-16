import { request } from '../http';

/** Fetch all claims for the authenticated user (JWT-identified — no user_id in path) */
export function getUserClaims() {
  return request('/claims/');
}

/** For backwards-compat callers that still pass userId — ignored, JWT is used */
export function getUserClaimsById(_userId) {
  return request('/claims/');
}
