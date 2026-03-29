import { request } from '../http';

export function createPaymentQuote(body) {
  return request('/payments/quote', {
    method: 'POST',
    body,
  });
}

export function createPaymentOrder(body) {
  return request('/payments/order', {
    method: 'POST',
    body,
  });
}

export function verifyPayment(body) {
  return request('/payments/verify', {
    method: 'POST',
    body,
  });
}
