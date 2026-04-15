import { request } from '../http';

const WEATHER_CACHE_TTL_MS = 2 * 60 * 1000;
const WEATHER_COORD_PRECISION = 3;
const weatherBundleCache = new Map();
const weatherBundleRequests = new Map();

export function calcUSAQI(pm25) {
  if (!pm25 || pm25 < 0) return 0;
  const table = [
    { cLow: 0.0, cHigh: 12.0, iLow: 0, iHigh: 50 },
    { cLow: 12.1, cHigh: 35.4, iLow: 51, iHigh: 100 },
    { cLow: 35.5, cHigh: 55.4, iLow: 101, iHigh: 150 },
    { cLow: 55.5, cHigh: 150.4, iLow: 151, iHigh: 200 },
    { cLow: 150.5, cHigh: 250.4, iLow: 201, iHigh: 300 },
    { cLow: 250.5, cHigh: 350.4, iLow: 301, iHigh: 400 },
    { cLow: 350.5, cHigh: 500.4, iLow: 401, iHigh: 500 }
  ];
  for (let t of table) {
    if (pm25 >= t.cLow && pm25 <= t.cHigh) {
      return Math.round(((t.iHigh - t.iLow) / (t.cHigh - t.cLow)) * (pm25 - t.cLow) + t.iLow);
    }
  }
  return 500;
}

function getWeatherCacheKey(lat, lon) {
  return `${Number(lat).toFixed(WEATHER_COORD_PRECISION)}:${Number(lon).toFixed(WEATHER_COORD_PRECISION)}`;
}

function getCachedWeatherBundle(lat, lon, { allowStale = false } = {}) {
  const cachedEntry = weatherBundleCache.get(getWeatherCacheKey(lat, lon));
  if (!cachedEntry) {
    return null;
  }

  const isFresh = Date.now() - cachedEntry.updatedAt <= WEATHER_CACHE_TTL_MS;
  if (!allowStale && !isFresh) {
    return null;
  }

  return cachedEntry.payload;
}

function storeWeatherBundle(lat, lon, payload) {
  weatherBundleCache.set(getWeatherCacheKey(lat, lon), {
    payload,
    updatedAt: Date.now(),
  });
  return payload;
}

const WMO_LABELS = {
  0: 'Clear',
  1: 'Mainly Clear',
  2: 'Partly Cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Fog',
  51: 'Light Drizzle',
  53: 'Drizzle',
  55: 'Heavy Drizzle',
  56: 'Freezing Drizzle',
  57: 'Freezing Drizzle',
  61: 'Light Rain',
  63: 'Rain',
  65: 'Heavy Rain',
  66: 'Freezing Rain',
  67: 'Freezing Rain',
  71: 'Light Snow',
  73: 'Snow',
  75: 'Heavy Snow',
  77: 'Snow Grains',
  80: 'Rain Showers',
  81: 'Rain Showers',
  82: 'Heavy Showers',
  85: 'Snow Showers',
  86: 'Snow Showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm',
  99: 'Thunderstorm'
};

const getWeatherCondition = (rawCondition, wmoCode) => {
  if (rawCondition) return rawCondition;
  if (wmoCode === undefined || wmoCode === null) return 'Unknown';
  return WMO_LABELS[wmoCode] || 'Unknown';
};

const toUnixTimestamp = (value) => {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return 0;
  return Math.floor(timestamp / 1000);
};

const normalizeForecastItem = (item) => {
  const pm25 = item?.pm25 ?? item?.aqi?.pm25 ?? 0;
  return {
    ...item,
    dt: item?.dt ?? toUnixTimestamp(item?.time),
    temperature: item?.temperature ?? item?.temp_c ?? 0,
    humidity: item?.humidity ?? 0,
    wind_speed: item?.wind_speed ?? item?.wind_kph ?? 0,
    weather_condition: getWeatherCondition(item?.weather_condition, item?.wmo_code),
    pm25,
    pm10: item?.pm10 ?? item?.aqi?.pm10 ?? 0,
    aqi_eu: item?.aqi_eu ?? item?.aqi?.aqi_eu ?? 0,
    us_aqi: calcUSAQI(pm25)
  };
};

const normalizeWeatherPayload = (data) => {
  if (!data) return null;

  const weather = data.weather || {};
  const aqi = data.aqi || {};
  const traffic = data.traffic || {};
  const parametricAnalysis = data.parametric_analysis || {};
  const pm25 = data.pm25 ?? aqi.pm25 ?? 0;
  const forecast = Array.isArray(data.forecast)
    ? data.forecast.map(normalizeForecastItem)
    : [];

  return {
    ...data,
    temperature: data.temperature ?? weather.temperature ?? weather.temp_c ?? null,
    weather_condition: getWeatherCondition(data.weather_condition ?? weather.weather_condition, weather.wmo_code),
    humidity: data.humidity ?? weather.humidity ?? null,
    wind_speed: data.wind_speed ?? weather.wind_speed ?? weather.wind_kph ?? null,
    pm25,
    pm10: data.pm10 ?? aqi.pm10 ?? 0,
    aqi_eu: data.aqi_eu ?? aqi.aqi_eu ?? 0,
    us_aqi: calcUSAQI(pm25),
    forecast,
    parametric_analysis: {
      is_disrupted: parametricAnalysis.is_disrupted ?? data.triggers?.disruption_active ?? false,
      disruption_reason: parametricAnalysis.disruption_reason ?? data.active_disruption ?? 'None',
      traffic_congestion: parametricAnalysis.traffic_congestion ??
        (traffic.congestion_score !== undefined ? Math.round(traffic.congestion_score * 100) : 0),
    }
  };
};

async function fetchWeatherBundle(lat, lon) {
  const path = `/weather/?lat=${lat}&lon=${lon}`;
  const data = await request(path, { method: 'GET' });
  return normalizeWeatherPayload(data);
}

export const getWeatherBundle = async (lat, lon, options = {}) => {
  const { forceRefresh = false } = options;

  if (!forceRefresh) {
    const cached = getCachedWeatherBundle(lat, lon);
    if (cached) {
      return cached;
    }
  }

  const cacheKey = getWeatherCacheKey(lat, lon);
  const inFlightRequest = weatherBundleRequests.get(cacheKey);
  if (inFlightRequest) {
    return inFlightRequest;
  }

  const requestPromise = (async () => {
    try {
      const payload = await fetchWeatherBundle(lat, lon);
      return storeWeatherBundle(lat, lon, payload);
    } catch (error) {
      const stalePayload = getCachedWeatherBundle(lat, lon, { allowStale: true });
      if (stalePayload) {
        return stalePayload;
      }
      console.warn("Weather fetch failed, falling back to mock:", error.message);
      return buildMockWeatherBundle(lat);
    } finally {
      weatherBundleRequests.delete(cacheKey);
    }
  })();

  weatherBundleRequests.set(cacheKey, requestPromise);
  return requestPromise;
};

// Mock data generator for when API fails
const getMockAQI = (lat) => {
  const pm25 = 12.5 + Math.random() * 50;
  return {
    aqi: 2,
    us_aqi: calcUSAQI(pm25),
    pm25: pm25,
    pm10: 25.0 + Math.random() * 50,
  };
};

function buildMockWeatherBundle(lat) {
  const mock = getMockAQI(lat);
  return {
    temperature: 28 + Math.random() * 5,
    weather_condition: 'Cloudy',
    humidity: 65,
    wind_speed: 10,
    aqi: mock.aqi,
    us_aqi: mock.us_aqi,
    pm25: mock.pm25,
    pm10: mock.pm10,
    aqi_eu: mock.aqi,
    forecast: [],
    parametric_analysis: {
      is_disrupted: false,
      disruption_reason: 'None',
      traffic_congestion: 0,
    }
  };
}

export const getLiveWeather = async (lat, lon) => {
  try {
    return await getWeatherBundle(lat, lon);
  } catch (error) {
    console.warn("Weather fetch failed, falling back to mock:", error.message);
    const mock = getMockAQI(lat);
    return {
      temperature: 28 + Math.random() * 5,
      weather_condition: 'Cloudy',
      aqi: mock.aqi,
      us_aqi: mock.us_aqi,
      pm25: mock.pm25
    };
  }
};

export const getAirQuality = async (lat, lon) => {
  try {
    const bundle = await getWeatherBundle(lat, lon);
    if (bundle && bundle.pm25 !== undefined) {
      return bundle;
    }
    return getMockAQI(lat);
  } catch (error) {
    console.warn("AQI fetch failed, falling back to mock:", error.message);
    return getMockAQI(lat);
  }
};

export const getForecast = async (lat, lon) => {
  try {
    return await getWeatherBundle(lat, lon);
  } catch (error) {
    console.warn("Forecast fetch failed:", error.message);
    return null;
  }
};
