import { request } from '../http';

/** Create a new policy (initial activation after payment) */
export function createPolicy(body) {
  return request('/policy/create', { method: 'POST', body });
}

/** Get the current user's active policy (JWT-authenticated) */
export function getActivePolicy() {
  return request('/policy/');
}

/**
 * Change the active policy tier.
 * Rate-limited by backend: once per 7 days.
 * Throws with message "Policy can only be changed once per week" if blocked.
 */
export function changePolicy(plan_tier) {
  return request('/policy/change', {
    method: 'POST',
    body: { plan_tier },
  });
}

/** Legacy: fetch policies by user_id */
export function getUserPolicies(userId) {
  return request(`/policy/user/${userId}`);
}
