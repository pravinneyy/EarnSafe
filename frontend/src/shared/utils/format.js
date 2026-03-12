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
  return `${Math.round(Number(value))}/100`;
}

export function toTitleCase(value) {
  return String(value)
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
