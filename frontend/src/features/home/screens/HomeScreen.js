import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import * as Location from 'expo-location';

import { getLiveWeather, getAirQuality, getForecast } from '../../../services/api/weatherApi';
import { AppPill } from '../../../shared/components';
import LiveMap from '../../../shared/components/LiveMap';
import { colors, radii, shadows, spacing, typography } from '../../../shared/theme';
import { useTheme } from '../../../shared/theme/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── AQI label mapping ────────────────────────
function getUsAqiParams(aqi) {
  if (aqi <= 50) return { label: 'Good', color: '#84cc16' };
  if (aqi <= 100) return { label: 'Moderate', color: '#facc15' };
  if (aqi <= 150) return { label: 'Poor', color: '#fb923c' }; 
  if (aqi <= 200) return { label: 'Unhealthy', color: '#f87171' };
  if (aqi <= 300) return { label: 'Severe', color: '#c084fc' };
  return { label: 'Hazardous', color: '#9f1239' };
}

// ─── Simple weather condition labels ──────────
function getSimpleWeather(condition) {
  if (!condition) return 'Loading';
  const c = condition.toLowerCase();
  if (c.includes('clear') || c.includes('sun')) return 'Sunny';
  if (c.includes('cloud') || c.includes('overcast')) return 'Cloudy';
  if (c.includes('rain') || c.includes('drizzle')) return 'Rainy';
  if (c.includes('storm') || c.includes('thunder')) return 'Stormy';
  if (c.includes('snow') || c.includes('sleet')) return 'Snowy';
  if (c.includes('fog') || c.includes('mist') || c.includes('haze')) return 'Foggy';
  if (c.includes('wind')) return 'Windy';
  return condition.charAt(0).toUpperCase() + condition.slice(1).split(' ')[0];
}

function getWeatherEmoji(condition) {
  if (!condition) return '🌤️';
  const c = condition.toLowerCase();
  if (c.includes('clear') || c.includes('sun')) return '☀️';
  if (c.includes('cloud')) return '☁️';
  if (c.includes('rain') || c.includes('drizzle')) return '🌧️';
  if (c.includes('storm') || c.includes('thunder')) return '⛈️';
  if (c.includes('snow')) return '🌨️';
  if (c.includes('fog') || c.includes('mist')) return '🌫️';
  return '🌤️';
}

// FORMAT TIME
function formatHour(timestamp) {
  const d = new Date(timestamp * 1000);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ───────────────────────────────────────────────
// Permission Gate
// ───────────────────────────────────────────────
function LocationGate({ onRetry }) {
  const { colors: c } = useTheme();
  return (
    <View style={[gateStyles.container, { backgroundColor: c.background }]}>
      <View style={[gateStyles.iconCircle, { backgroundColor: c.accentSoft }]}>
        <Text style={gateStyles.icon}>📍</Text>
      </View>
      <Text style={[gateStyles.title, { color: c.text }]}>Location Required</Text>
      <Text style={[gateStyles.body, { color: c.textSecondary }]}>
        EarnSafe needs access to your location to show real-time weather
        conditions and air quality.
      </Text>
      <Pressable
        style={({ pressed }) => [
          gateStyles.button,
          pressed && gateStyles.buttonPressed,
        ]}
        onPress={onRetry}
        accessibilityRole="button"
      >
        <Text style={gateStyles.buttonText}>Grant Permission</Text>
      </Pressable>
    </View>
  );
}

const gateStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  icon: { fontSize: 40 },
  title: { ...typography.h1, marginBottom: spacing.sm, textAlign: 'center' },
  body: { ...typography.body, textAlign: 'center', marginBottom: spacing.xl, lineHeight: 22 },
  button: {
    backgroundColor: '#10B981',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    ...shadows.glow,
  },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});

// ── Map styles ─────────────────────────────────
const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#080E1A' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#64748B' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#111B2E' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1A2740' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#223352' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#223352' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#111B2E' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

const lightMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#f5f5f5' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#c9d6e3' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// ───────────────────────────────────────────────
// Main Home Screen
// ───────────────────────────────────────────────
export default function HomeScreen({ route }) {
  const { user, policy } = route.params || {};
  const [weather, setWeather] = useState(null);
  const [airQuality, setAirQuality] = useState(null);
  const [forecast, setForecast] = useState([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const mapRef = useRef(null);
  const { isDark, colors: c } = useTheme();

  // Location state
  const [permissionStatus, setPermissionStatus] = useState('loading');
  const [location, setLocation] = useState(null);
  const locationSub = useRef(null);
  const hasAnimated = useRef(false);

  // ── Request permission & start watcher ──────
  async function requestLocationPermission() {
    setPermissionStatus('loading');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setPermissionStatus('granted');
        startLocationWatcher();
      } else {
        setPermissionStatus('denied');
      }
    } catch (e) {
      console.log('Permission error', e);
      setPermissionStatus('denied');
    }
  }

  async function startLocationWatcher() {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setLocation(coords);
      if (!hasAnimated.current) {
        animateToCoords(coords);
        hasAnimated.current = true;
      }
    } catch (_) {}

    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 30000,
        distanceInterval: 50,
      },
      (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setLocation(coords);
      },
    );
  }

  function animateToCoords(coords) {
    mapRef.current?.animateToRegion(
      { ...coords, latitudeDelta: 0.012, longitudeDelta: 0.012 },
      600,
    );
  }

  useEffect(() => {
    requestLocationPermission();
    return () => { locationSub.current?.remove(); };
  }, []);

  // ── Load weather + AQI + Forecast ──────────────
  useEffect(() => {
    if (!location) return;

    async function fetchData() {
      try {
        const [weatherData, aqiData, forecastData] = await Promise.all([
          getLiveWeather(location.latitude, location.longitude),
          getAirQuality(location.latitude, location.longitude),
          getForecast(location.latitude, location.longitude)
        ]);
        if (weatherData) setWeather(weatherData);
        if (aqiData) setAirQuality(aqiData);
        if (forecastData && forecastData.forecast) setForecast(forecastData.forecast);
      } catch (_) {
        console.log('Error loading weather/AQI');
      }
    }

    fetchData();
  }, [location?.latitude, location?.longitude]);

  // Expand Animation helper
  const toggleExpand = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsExpanded(!isExpanded);
  };

  // ── Permission gate ─────────────────────────
  if (permissionStatus === 'loading') {
    return (
      <View style={[gateStyles.container, { backgroundColor: c.background }]}>
        <ActivityIndicator size="large" color={c.accent} />
        <Text style={[gateStyles.body, { color: c.textSecondary, marginTop: spacing.md }]}>
          Checking location access…
        </Text>
      </View>
    );
  }

  if (permissionStatus === 'denied') {
    return <LocationGate onRetry={requestLocationPermission} />;
  }

  // ── Derived data ─────────────────────────────
  const firstName = user?.name?.split(' ')[0] || 'Rider';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const aqiValue = airQuality?.us_aqi || weather?.us_aqi || null;
  const aqiParams = aqiValue ? getUsAqiParams(aqiValue) : { label: '—', color: '#64748B' };
  const aqiDisplay = aqiValue ? `${aqiValue}` : '—';
  const aqiColor = aqiParams.color;
  
  const weatherCondition = getSimpleWeather(weather?.weather_condition);
  const weatherEmoji = getWeatherEmoji(weather?.weather_condition);

  const region = location
    ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }
    : { latitude: 19.076, longitude: 72.8777, latitudeDelta: 0.015, longitudeDelta: 0.015 };

  const overlayBg = isDark ? 'rgba(8,14,26,0.95)' : 'rgba(255,255,255,0.98)';
  const overlayText = isDark ? '#FFFFFF' : '#0F172A';
  const overlayMuted = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.5)';

  return (
    <View style={styles.root}>
      {/* ── Full-screen Map ── */}
      <LiveMap
        mapRef={mapRef}
        region={region}
        isDark={isDark}
        location={location}
        firstName={firstName}
        darkMapStyle={darkMapStyle}
        lightMapStyle={lightMapStyle}
        zone={user?.delivery_zone}
      />

      {/* ── TOP OVERLAY: Greeting + Status ── */}
      <View style={styles.overlayTop}>
        <View style={[styles.greetingBar, { backgroundColor: overlayBg }]}>
          <View>
            <Text style={[styles.greetingSmall, { color: overlayMuted }]}>{greeting}</Text>
            <Text style={[styles.greetingName, { color: overlayText }]}>{firstName}</Text>
          </View>
          <AppPill
            label={policy ? 'Covered' : 'No Policy'}
            tone={policy ? 'success' : 'warning'}
          />
        </View>
      </View>

      {/* ── BOTTOM OVERLAY: Weather Strip & Forecast ── */}
      <View style={styles.overlayBottom}>
        {/* ── PHASE 2 ALERT BAR ── */}
  {weather?.parametric_analysis?.is_disrupted && (
    <View style={styles.alertContainer}>
      <View style={[
        styles.alertBar, 
        { 
          backgroundColor: isDark ? 'rgba(153, 27, 27, 0.95)' : 'rgba(254, 242, 242, 0.98)',
          borderColor: '#EF4444' 
        }
      ]}>
        <Text style={styles.alertEmoji}>⚠️</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.alertTitle, { color: isDark ? '#FCA5A5' : '#B91C1C' }]}>
            Disruption Detected
          </Text>
          <Text style={[styles.alertReason, { color: isDark ? '#FFFFFF' : '#7F1D1D' }]}>
            {weather.parametric_analysis.disruption_reason}
          </Text>
        </View>
        <AppPill label="Payout Active" tone="danger" />
      </View>
    </View>
  )}
        <View style={[styles.weatherContainer, { backgroundColor: overlayBg }]}>
          
          {/* Top minimal strip (Click to expand) */}
          {/* Top minimal strip (Click to expand) */}
<Pressable onPress={toggleExpand} style={styles.compactStrip}>
<View style={styles.stripLeft}>
<Text style={{fontSize: 24}}>📍</Text>
<View style={{flex: 1, marginLeft: 6}}>
<Text numberOfLines={1} ellipsizeMode="tail" style={styles.zoneText}>{user?.delivery_zone || 'Locating…'}</Text>
<Text style={styles.expandHint}>Tap for forecast</Text>
</View>
</View>
<View style={styles.stripRight}>
<Text style={[styles.statVal, {color: '#F59E0B'}]}>{weather ? `${Math.round(weather.temperature)}°` : '--'}</Text>
<View style={styles.weatherDivider} />
<Text style={[styles.statVal, {color: aqiColor}]}>AQI {aqiDisplay}</Text>
<View style={styles.weatherDivider} />
<View style={{flexDirection: 'row', alignItems: 'center'}}>
<Text style={{fontSize: 16}}>{!!(weather?.parametric_analysis?.traffic_congestion > 70) ? '🔴' : '🟢'}</Text>
<Text style={[styles.statVal, {color: (weather?.parametric_analysis?.traffic_congestion > 70) ? '#EF4444' : '#10B981', marginLeft: 2}]}>{weather?.parametric_analysis?.traffic_congestion ? `${Math.round(weather.parametric_analysis.traffic_congestion)}%` : '0%'}</Text>
</View>
<View style={styles.weatherDivider} />
<Text style={{fontSize: 20}}>{weatherEmoji}</Text>
</View>
</Pressable>

          {/* Expanded Forecast Area */}
          {isExpanded && (
            <View style={styles.forecastArea}>
               <Text style={[styles.forecastTitle, { color: overlayText }]}>
                  Hourly forecast
               </Text>
               
               {forecast.length === 0 ? (
                 <View style={styles.forecastLoading}>
                    <ActivityIndicator color={c.accent} size="small" />
                 </View>
               ) : (
                 <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.forecastScroll}>
                   {forecast.map((item, idx) => {
                     const fAqi = item.us_aqi || 1;
                     const fAqiParams = getUsAqiParams(fAqi);
                     const fAqiColor = fAqiParams.color;
                     const fEmoji = getWeatherEmoji(item.weather_condition);

                     return (
                       <View key={idx} style={styles.forecastItem}>
                         <Text style={[styles.fcTime, { color: overlayMuted }]}>
                           {idx === 0 ? 'Now' : formatHour(item.dt)}
                         </Text>
                         <View style={[styles.fcAqiBadge, { backgroundColor: fAqiColor }]}>
                           <Text style={styles.fcAqiText}>{fAqi}</Text>
                         </View>
                         <Text style={styles.fcEmoji}>{fEmoji}</Text>
                         <Text style={[styles.fcTemp, { color: overlayText }]}>
                           {Math.round(item.temperature)}°
                         </Text>
                         <Text style={styles.fcWindIcon}>▼</Text>
                         <Text style={[styles.fcWind, { color: overlayMuted }]}>
                           {Math.round(item.wind_speed)} km/h
                         </Text>
                         <Text style={[styles.fcHumid, { color: '#3B82F6' }]}>
                           💧 {item.humidity}%
                         </Text>
                       </View>
                     );
                   })}
                 </ScrollView>
               )}
            </View>
          )}

        </View>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  overlayTop: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 36,
    left: spacing.md, right: spacing.md,
    zIndex: 10,
  },
  greetingBar: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    ...shadows.sm,
  },
  greetingSmall: { fontSize: 12, fontWeight: '500' },
  greetingName: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },

  overlayBottom: {
    position: 'absolute',
    bottom: spacing.sm, left: spacing.md, right: spacing.md,
    zIndex: 10,
  },
  
  weatherContainer: {
    borderRadius: radii.xl, // More rounded corners for the larger strip
    overflow: 'hidden',
    ...shadows.elevated,
    marginBottom: spacing.xs,
  },
  /* --- STABLE & LARGE WEATHER STRIP --- */
  /* --- PREMIUM LARGE WEATHER STRIP --- */
  /* --- BULLETPROOF LAYOUT --- */
  /* --- PREMIUM LARGE & WIDE STRIP --- */
  compactStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 24, // TALLER BAR (as requested)
    width: '100%',
    minHeight: 80,       // Ensures it feels "big"
  },
  stripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1.5,           // Gives even MORE room to the location name
    marginRight: 6,
  },
  stripRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,       // Forces icons to stay on one line
    gap: 4,              // Tighter gap to make room for city name
  },
  zoneText: { 
    fontSize: 20,        // LARGE CITY NAME
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  expandHint: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
  },
  statVal: { 
    fontSize: 13,        // COMPACT NUMBERS (needed to prevent truncation)
    fontWeight: '900',
  },
  weatherDivider: { 
    width: 1, 
    height: 18, 
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 1,
  },

  /* Forecast Area */
  forecastArea: {
    overflow: 'hidden',
    borderTopWidth: 1,
    borderTopColor: 'rgba(150,150,150,0.15)',
  },
  forecastTitle: {
    fontSize: 14, fontWeight: '700',
    paddingHorizontal: spacing.md, paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  forecastLoading: { height: 120, alignItems: 'center', justifyContent: 'center' },
  forecastScroll: { paddingHorizontal: spacing.sm, paddingBottom: spacing.md, alignItems: 'center' },
  
  forecastItem: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  fcTime: { fontSize: 12, fontWeight: '600', marginBottom: 6 },
  fcAqiBadge: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6, marginBottom: 8,
    minWidth: 32, alignItems: 'center',
  },
  fcAqiText: { color: '#000', fontSize: 12, fontWeight: '800' },
  fcEmoji: { fontSize: 18, marginBottom: 6 },
  fcTemp: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  fcWindIcon: { fontSize: 10, color: '#94A3B8', marginBottom: 2 },
  fcWind: { fontSize: 11, marginBottom: 4 },
  fcHumid: { fontSize: 11, fontWeight: '600' },

  alertContainer: {
    marginBottom: spacing.xs,
    width: '100%',
  },
  alertBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    ...shadows.md,
  },
  alertEmoji: { fontSize: 20, marginRight: spacing.sm },
  alertTitle: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  alertReason: { fontSize: 13, fontWeight: '600' },
});
