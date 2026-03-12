import { request } from '../http';

export function registerUser(body) {
  return request('/users/register', {
    method: 'POST',
    body,
  });
}

export function listUsers() {
  return request('/users/');
}
