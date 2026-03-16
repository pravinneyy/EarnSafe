import { request } from '../http'; // Import the 'request' function specifically

export const getLiveWeather = async (lat, lon) => {
  try {
    // Your request helper appends the path to the Base URL.
    // We pass the lat and lon as a query string in the path.
    const path = `/weather/?lat=${lat}&lon=${lon}`;

    const data = await request(path, {
      method: 'GET',
    });

    return data;
  } catch (error) {
    console.error("Weather fetch failed:", error.message);
    return null;
  }
};