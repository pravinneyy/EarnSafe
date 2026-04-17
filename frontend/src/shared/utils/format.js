export function formatCurrency(value) {
  return `Rs. ${Number(value).toFixed(0)}`;
}

export function formatHours(value) {
  return `${Number(value).toFixed(1).replace(/\.0$/, '')}h`;
}

export function formatPercent(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

export function formatPercentFromRatio(value) {
  return `${Math.round(Number(value) * 100)}%`;
}

export function formatPercentFromScore(value) {
  // risk_score is now a 0.0–1.0 ratio from the ML model
  const pct = Number(value) <= 1.0 ? Math.round(Number(value) * 100) : Math.round(Number(value));
  return `${pct}/100`;
}

export function toTitleCase(value) {
  return String(value)
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
