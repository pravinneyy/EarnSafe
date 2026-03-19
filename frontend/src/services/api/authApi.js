import { request } from '../http';

export function registerUser(body) {
  return request('/users/register', {
    method: 'POST',
    body,
  });
}

export function loginUser(body) {
  return request('/users/login', {
    method: 'POST',
    body,
  });
}
