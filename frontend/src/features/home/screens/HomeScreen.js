import React, { useEffect, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View, Dimensions } from 'react-native';
import MapView, { Marker } from 'react-native-maps'; // NEW: Mobile Maps

import { getUserClaims } from '../../../services/api';
import { getLiveWeather } from '../../../services/api/weatherApi'; // NEW
import ClaimListItem from '../../claims/components/ClaimListItem';
import { DISRUPTION_OPTIONS } from '../../claims/constants';
import { AppButton, AppCard, AppPill, Screen, SectionHeading } from '../../../shared/components';
import { colors, spacing } from '../../../shared/theme';
import { formatCurrency, formatPercentFromScore, toTitleCase } from '../../../shared/utils/format';

export default function HomeScreen({ route, navigation }) {
  const { user, policy } = route.params;
  const [claims, setClaims] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [weather, setWeather] = useState(null); // NEW: Weather State

  // Default coordinates (In production, use navigator.geolocation)
  const [location] = useState({
    latitude: 19.0760, 
    longitude: 72.8777,
  });

  async function loadData() {
    try {
      const [claimsData, weatherData] = await Promise.all([
        getUserClaims(user.id),
        getLiveWeather(location.latitude, location.longitude)
      ]);
      setClaims([...claimsData].sort((left, right) => right.id - left.id));
      setWeather(weatherData);
    } catch (_error) {
      console.log("Error loading dashboard data");
    }
  }

  useEffect(() => {
    loadData();
  }, [user.id]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  const totalPaid = claims
    .filter(claim => claim.status === 'approved')
    .reduce((sum, claim) => sum + claim.claim_amount, 0);

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />
      }
    >
      <SectionHeading
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        subtitle="Your coverage is active. We are monitoring your zone for disruptions."
      />

      {/* NEW: Live Weather & AQI Monitoring Card */}
      <SectionHeading title="Live Monitoring" subtitle="Real-time environmental data for your zone." />
      <AppCard style={styles.weatherCard}>
        {weather ? (
          <>
            <View style={styles.weatherRow}>
              <View>
                <Text style={styles.tempText}>{Math.round(weather.temperature)}°C</Text>
                <Text style={styles.conditionText}>{toTitleCase(weather.weather_condition)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <AppPill 
                  label={`AQI: ${weather.aqi}`} 
                  tone={weather.aqi >= 4 ? "danger" : weather.aqi === 3 ? "warning" : "success"} 
                />
                <Text style={styles.statusText}>
                  {weather.parametric_analysis.is_disrupted ? "⚠️ Disruption Detected" : "✅ Status: Safe"}
                </Text>
              </View>
            </View>

            {/* Mobile Map Component */}
            <View style={styles.mapContainer}>
              <MapView
                style={styles.map}
                initialRegion={{
                  ...location,
                  latitudeDelta: 0.05,
                  longitudeDelta: 0.05,
                }}
                scrollEnabled={false}
              >
                <Marker coordinate={location} title="Your Insured Zone" />
              </MapView>
            </View>
          </>
        ) : (
          <Text>Loading live environment data...</Text>
        )}
      </AppCard>

      {/* ... (Existing Coverage Card remains same) ... */}
      <AppCard style={styles.coverageCard}>
         <View style={styles.coverageHeader}>
          <View>
            <Text style={styles.coverageTitle}>{toTitleCase(policy.plan_tier)} Shield</Text>
            <Text style={styles.coverageSubtitle}>Current policy</Text>
          </View>
          <AppPill label="Active" tone="success" />
        </View>

        <View style={styles.statGrid}>
          <OverviewStat label="Daily coverage" value={formatCurrency(policy.daily_coverage)} />
          <OverviewStat label="Weekly premium" value={formatCurrency(policy.weekly_premium)} />
          <OverviewStat label="Max payout" value={formatCurrency(policy.max_weekly_payout)} />
          <OverviewStat label="Risk score" value={formatPercentFromScore(user.risk_score)} />
        </View>

        <View style={styles.metaBlock}>
          <Text style={styles.metaLine}>City: {user.city}</Text>
          <Text style={styles.metaLine}>Zone: {user.delivery_zone}</Text>
          <Text style={styles.metaLine}>Total paid out: {formatCurrency(totalPaid)}</Text>
        </View>
      </AppCard>

      <AppButton
        label="View claim history"
        variant="secondary"
        onPress={() => navigation.navigate('ClaimHistory', { user })}
        style={styles.secondaryAction}
      />

      <SectionHeading title="Covered events" subtitle="Disruption types we monitor." />
      <View style={styles.coveredEvents}>
        {DISRUPTION_OPTIONS.map(option => (
          <AppPill key={option.key} label={option.label} tone="neutral" style={styles.eventPill} />
        ))}
      </View>

      <SectionHeading title="Recent claims" subtitle="Latest automatically triggered claims." />
      {claims.length === 0 ? (
        <AppCard>
          <Text style={styles.emptyTitle}>No automated claims yet</Text>
          <Text style={styles.emptyText}>When a disruption is verified, your claim will appear here.</Text>
        </AppCard>
      ) : (
        claims.slice(0, 3).map(claim => <ClaimListItem key={claim.id} claim={claim} />)
      )}
    </Screen>
  );
}

function OverviewStat({ label, value }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // NEW STYLES
  weatherCard: { marginBottom: spacing.lg, padding: spacing.md },
  weatherRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.md },
  tempText: { fontSize: 32, fontWeight: 'bold', color: colors.text },
  conditionText: { fontSize: 16, color: colors.textSoft },
  statusText: { marginTop: 8, fontWeight: '600', fontSize: 12 },
  mapContainer: { height: 150, width: '100%', borderRadius: 12, overflow: 'hidden', marginTop: 10 },
  map: { flex: 1 },

  // EXISTING STYLES
  coverageCard: { marginBottom: spacing.lg },
  coverageHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  coverageTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  coverageSubtitle: { color: colors.textSoft, fontSize: 14 },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.sm },
  statItem: { width: '50%', marginBottom: spacing.md },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 4 },
  statLabel: { color: colors.textSoft, fontSize: 13 },
  metaBlock: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  metaLine: { color: colors.textSoft, fontSize: 14, lineHeight: 22 },
  secondaryAction: { marginBottom: spacing.lg },
  coveredEvents: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg },
  eventPill: { marginRight: spacing.sm, marginBottom: spacing.sm },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '600', marginBottom: spacing.xs },
  emptyText: { color: colors.textSoft, fontSize: 14, lineHeight: 22 },
});