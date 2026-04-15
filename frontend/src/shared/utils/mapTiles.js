const FALLBACK_TOMTOM_API_KEY = 'xvbEehknuA9equoFt2UtfRkWmKcqB6S0';
const tomTomApiKey =
  process.env.EXPO_PUBLIC_TOMTOM_API_KEY?.trim() ||
  FALLBACK_TOMTOM_API_KEY;

function getTomTomMode(isDark) {
  return isDark ? 'night' : 'main';
}

export function getLeafletTileConfig({ isDark = false } = {}) {
  if (tomTomApiKey) {
    return {
      tileUrl: `https://api.tomtom.com/map/1/tile/basic/${getTomTomMode(isDark)}/{z}/{x}/{y}.png?key=${encodeURIComponent(tomTomApiKey)}&view=Unified`,
      attribution:
        '&copy; <a href="https://www.tomtom.com/">TomTom</a> | ' +
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
      subdomains: []
    };
  }

  return {
    tileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
    errorMessage: null
  };
}
