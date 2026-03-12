export const DISRUPTION_OPTIONS = [
  { key: 'heavy_rainfall', label: 'Heavy rainfall' },
  { key: 'extreme_heat', label: 'Extreme heat' },
  { key: 'flood_alert', label: 'Flood alert' },
  { key: 'severe_aqi', label: 'Severe AQI' },
  { key: 'dense_fog', label: 'Dense fog' },
  { key: 'curfew', label: 'Curfew or bandh' },
];

export function getDisruptionLabel(value) {
  return (
    DISRUPTION_OPTIONS.find(option => option.key === value)?.label ||
    value.replace(/_/g, ' ')
  );
}

export function getStatusTone(status) {
  if (status === 'approved') {
    return 'success';
  }
  if (status === 'flagged') {
    return 'warning';
  }
  if (status === 'rejected') {
    return 'danger';
  }
  return 'neutral';
}
