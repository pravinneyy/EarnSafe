import { request, setAuthToken } from '../http';

export async function registerUser(body) {
  const session = await request('/users/register', {
    method: 'POST',
    body,
  });
  if (session?.access_token) {
    setAuthToken(session.access_token);
  }
  return {
    id: session.id,
    username: session.username,
    name: session.name,
    phone: session.phone,
    city: session.city,
    delivery_zone: session.delivery_zone,
    platform: session.platform,
    weekly_income: session.weekly_income,
    risk_score: session.risk_score,
  };
}

export async function loginUser(body) {
  const session = await request('/users/login', {
    method: 'POST',
    body,
  });
  if (session?.access_token) {
    setAuthToken(session.access_token);
  }
  return session;
}
