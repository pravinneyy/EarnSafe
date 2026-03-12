import { request } from '../http';

export function getUserClaims(userId) {
  return request(`/claims/user/${userId}`);
}
