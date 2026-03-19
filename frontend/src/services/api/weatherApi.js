import { request } from '../http';

// Mock data generator for when API fails
const getMockAQI = (lat) => {
  const aqiIndex = (Math.floor(Math.abs(lat * 10)) % 5) + 1; // 1 to 5
  return {
    aqi: aqiIndex,
    pm25: 12.5 + aqiIndex * 5,
    pm10: 25.0 + aqiIndex * 10,
    co: 200 + aqiIndex * 50,
    no2: Math.random() * 5,
    o3: 50 + Math.random() * 20,
    so2: Math.random() * 2,
  };
};

export const getLiveWeather = async (lat, lon) => {
  try {
    const path = `/weather/?lat=${lat}&lon=${lon}`;
    const data = await request(path, { method: 'GET' });
    return data;
  } catch (error) {
    console.error("Weather fetch failed, falling back to mock:", error.message);
    return {
      temperature: 28 + Math.random() * 5,
      weather_condition: 'Cloudy',
      aqi: getMockAQI(lat).aqi,
    };
  }
};

export const getAirQuality = async (lat, lon) => {
  try {
    // Route through our backend which has the real API key
    const path = `/weather/?lat=${lat}&lon=${lon}`;
    const data = await request(path, { method: 'GET' });

    if (data && data.aqi !== undefined) {
      return {
        aqi: data.aqi,
        pm25: data.pm25 || 0,
        pm10: data.pm10 || 0,
        co: data.co || 0,
        no2: data.no2 || 0,
        o3: data.o3 || 0,
        so2: data.so2 || 0,
      };
    }
    return getMockAQI(lat);
  } catch (error) {
    console.error("AQI fetch failed, falling back to mock:", error.message);
    return getMockAQI(lat);
  }
};