import { request } from '../http';

export function createPolicy(body) {
  return request('/policy/create', {
    method: 'POST',
    body,
  });
}

export function getUserPolicies(userId) {
  return request(`/policy/user/${userId}`);
}
