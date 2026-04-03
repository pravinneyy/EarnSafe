const tomTomApiKey = process.env.EXPO_PUBLIC_TOMTOM_API_KEY?.trim();

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
    tileUrl: null,
    attribution: '',
    maxZoom: 19,
    subdomains: [],
    errorMessage: 'Map tiles are unavailable because EXPO_PUBLIC_TOMTOM_API_KEY is not configured.'
  };
}
