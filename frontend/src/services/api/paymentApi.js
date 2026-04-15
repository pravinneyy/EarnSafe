import { request } from '../http';

function buildPaymentIdempotencyKey(body) {
  return `payment-${body.user_id}-${body.plan_tier}-${body.quote_id}`;
}

export function createPaymentQuote(body) {
  return request('/payments/quote', {
    method: 'POST',
    body,
  });
}

export function createPaymentOrder(body) {
  const requestBody = body?.idempotency_key
    ? body
    : {
        ...body,
        idempotency_key: buildPaymentIdempotencyKey(body),
      };

  return request('/payments/order', {
    method: 'POST',
    body: requestBody,
  });
}

export function verifyPayment(body) {
  return request('/payments/verify', {
    method: 'POST',
    body,
  });
}
