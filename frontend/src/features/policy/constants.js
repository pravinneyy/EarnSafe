export const PLANS = [
  {
    tier: 'basic',
    label: 'Basic Shield',
    premium: 29,
    dailyCoverage: 300,
    maxWeeklyPayout: 1500,
    description: 'For part-time delivery partners with lower weekly exposure.',
  },
  {
    tier: 'standard',
    label: 'Standard Shield',
    premium: 49,
    dailyCoverage: 500,
    maxWeeklyPayout: 2500,
    description: 'Balanced protection for most full-time workers.',
    recommended: true,
  },
  {
    tier: 'pro',
    label: 'Pro Shield',
    premium: 89,
    dailyCoverage: 800,
    maxWeeklyPayout: 4000,
    description: 'Higher protection for dual-app workers or heavy earners.',
  },
];

export function getRiskMessage(score) {
  if (score >= 75) {
    return 'Higher-risk profile. Stronger coverage is worth considering.';
  }
  if (score >= 60) {
    return 'Moderate-risk profile. Standard cover will fit most workers.';
  }
  return 'Lower-risk profile. Basic cover may already be enough.';
}
