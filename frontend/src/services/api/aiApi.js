import { request } from '../http';

/**
 * Fetch real-time AI-powered premium quote from the CatBoost model.
 *
 * @param {string} zone     - Delivery zone (e.g. "Velachery")
 * @param {string} persona  - Delivery type (e.g. "Food")
 * @param {string} tier     - Plan tier: "basic" | "standard" | "pro"
 */
export function getAIPremium(zone, persona, tier = 'standard') {
  const params = new URLSearchParams({ zone, persona, tier });
  return request(`/policy/ai-premium?${params.toString()}`);
}
