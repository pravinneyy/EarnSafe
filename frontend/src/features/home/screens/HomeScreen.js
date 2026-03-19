import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';

import { getLiveWeather, getAirQuality } from '../../../services/api/weatherApi';
import { AppPill } from '../../../shared/components';
import { colors, radii, shadows, spacing, typography } from '../../../shared/theme';
import { useTheme } from '../../../shared/theme/ThemeContext';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// ─── AQI label mapping ────────────────────────
const AQI_LABELS = {
  1: 'Good',
  2: 'Fair',
  3: 'Moderate',
  4: 'Poor',
  5: 'Very Poor',
};

const AQI_COLORS = {
  1: '#10B981',
  2: '#34D399',
  3: '#F59E0B',
  4: '#EF4444',
  5: '#DC2626',
};

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
  // Capitalize first letter of first word as fallback
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
  title: {
    ...typography.h1,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  body: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
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
    // Get initial position once
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

    // Watch for significant changes only (50m minimum, 30s interval)
    locationSub.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 30000,    // 30 seconds
        distanceInterval: 50,   // 50 meters
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

  // ── Load weather + AQI ──────────────────────
  useEffect(() => {
    if (!location) return;

    async function fetchData() {
      try {
        const [weatherData, aqiData] = await Promise.all([
          getLiveWeather(location.latitude, location.longitude),
          getAirQuality(location.latitude, location.longitude),
        ]);
        if (weatherData) setWeather(weatherData);
        if (aqiData) setAirQuality(aqiData);
      } catch (_) {
        console.log('Error loading weather/AQI');
      }
    }

    fetchData();
  }, [location?.latitude, location?.longitude]);

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

  const aqiIndex = airQuality?.aqi || weather?.aqi || null;
  const aqiDisplay = aqiIndex ? `${aqiIndex}` : '—';
  const aqiColor = aqiIndex ? (AQI_COLORS[aqiIndex] || '#64748B') : '#64748B';
  const weatherCondition = getSimpleWeather(weather?.weather_condition);
  const weatherEmoji = getWeatherEmoji(weather?.weather_condition);

  const region = location
    ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.012, longitudeDelta: 0.012 }
    : { latitude: 19.076, longitude: 72.8777, latitudeDelta: 0.015, longitudeDelta: 0.015 };

  const overlayBg = isDark ? 'rgba(8,14,26,0.88)' : 'rgba(255,255,255,0.92)';
  const overlayText = isDark ? '#FFFFFF' : '#0F172A';
  const overlayMuted = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(15,23,42,0.5)';

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <SectionHeading
        title={`Welcome back, ${user?.name ? user.name.split(' ')[0] : 'Guest'}!`}
        subtitle="Your coverage is active. Review your plan, monitor covered events, and check automatically triggered claims."
      />

      <AppCard style={styles.coverageCard}>
        <View style={styles.coverageHeader}>
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

      {/* ── BOTTOM OVERLAY: Weather Strip ── */}
      <View style={styles.overlayBottom}>
        {/* Zone bar */}
        <View style={[styles.zoneBar, { backgroundColor: overlayBg }]}>
          <Text style={{ fontSize: 14, marginRight: 6 }}>📍</Text>
          <Text style={[styles.zoneText, { color: overlayText }]}>
            {user?.delivery_zone || 'Locating…'}
          </Text>
          <Text style={[styles.zoneCondition, { color: aqiColor }]}>
            AQI: {aqiDisplay}
          </Text>
        </View>

        {/* Compact weather strip */}
        <View style={[styles.weatherStrip, { backgroundColor: overlayBg }]}>
          {/* Temperature */}
          <View style={styles.weatherItem}>
            <Text style={styles.weatherEmoji}>🌡️</Text>
            <Text style={[styles.weatherVal, { color: '#F59E0B' }]}>
              {weather ? `${Math.round(weather.temperature)}°` : '—'}
            </Text>
          </View>

          <View style={[styles.weatherDivider, { backgroundColor: overlayMuted }]} />

          {/* AQI */}
          <View style={styles.weatherItem}>
            <Text style={styles.weatherEmoji}>💨</Text>
            <Text style={[styles.weatherVal, { color: aqiColor }]}>AQI {aqiDisplay}</Text>
          </View>

          <View style={[styles.weatherDivider, { backgroundColor: overlayMuted }]} />

          {/* Condition */}
          <View style={styles.weatherItem}>
            <Text style={styles.weatherEmoji}>{weatherEmoji}</Text>
            <Text style={[styles.weatherVal, { color: '#3B82F6' }]}>{weatherCondition}</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Top
  overlayTop: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 54 : 36,
    left: spacing.md,
    right: spacing.md,
    zIndex: 10,
  },
  greetingBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  greetingSmall: {
    fontSize: 12,
    fontWeight: '500',
  },
  greetingName: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  // Bottom
  overlayBottom: {
    position: 'absolute',
    bottom: spacing.sm,
    left: spacing.md,
    right: spacing.md,
    zIndex: 10,
  },

  // Zone bar
  zoneBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  zoneText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  zoneCondition: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Weather strip — compact single row
  weatherStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  weatherItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  weatherEmoji: {
    fontSize: 16,
    marginRight: 4,
  },
  weatherVal: {
    fontSize: 14,
    fontWeight: '700',
  },
  weatherDivider: {
    width: 1,
    height: 20,
    opacity: 0.3,
  },
});