import { request } from '../http';

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

export const getLiveWeather = async (lat, lon) => {
  try {
    const path = `/weather/?lat=${lat}&lon=${lon}`;
    const data = await request(path, { method: 'GET' });
    if (data && data.pm25 !== undefined) {
      data.us_aqi = calcUSAQI(data.pm25);
    }
    return data;
  } catch (error) {
    console.error("Weather fetch failed, falling back to mock:", error.message);
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
    const path = `/weather/?lat=${lat}&lon=${lon}`;
    const data = await request(path, { method: 'GET' });

    if (data && data.pm25 !== undefined) {
      return {
        ...data,
        us_aqi: calcUSAQI(data.pm25),
      };
    }
    return getMockAQI(lat);
  } catch (error) {
    console.error("AQI fetch failed, falling back to mock:", error.message);
    return getMockAQI(lat);
  }
};

export const getForecast = async (lat, lon) => {
  try {
    const path = `/weather/forecast?lat=${lat}&lon=${lon}`;
    const data = await request(path, { method: 'GET' });
    if (data && data.forecast) {
      data.forecast = data.forecast.map(item => ({
        ...item,
        us_aqi: calcUSAQI(item.pm25 || 0)
      }));
    }
    return data;
  } catch (error) {
    console.error("Forecast fetch failed:", error.message);
    return null;
  }
};