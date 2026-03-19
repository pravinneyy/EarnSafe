import React, { useState, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { createPolicy, getAIPremium } from '../../../services/api';
import { getRiskMessage, PLANS } from '../constants';
import PlanOptionCard from '../components/PlanOptionCard';
import {
  AppButton,
  AppCard,
  AppPill,
  Screen,
  SectionHeading,
} from '../../../shared/components';
import { radii, spacing } from '../../../shared/theme';
import { useTheme } from '../../../shared/theme/ThemeContext';
import {
  formatCurrency,
  formatPercentFromScore,
  toTitleCase,
} from '../../../shared/utils/format';

// ── Risk gauge arc visual ────────────────────
function RiskGauge({ score, color }) {
  const animVal = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(animVal, {
      toValue: score,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [score]);

  const width = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
    extrapolate: 'clamp',
  });

  return (
    <View style={gaugeStyles.track}>
      <Animated.View style={[gaugeStyles.fill, { width, backgroundColor: color }]} />
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 4,
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
});

// ── Risk level helper ────────────────────────
function getRiskLevel(score) {
  if (score >= 0.7) return { label: 'High Risk', color: '#EF4444', emoji: '🔴' };
  if (score >= 0.4) return { label: 'Moderate', color: '#F59E0B', emoji: '🟡' };
  return { label: 'Low Risk', color: '#10B981', emoji: '🟢' };
}

// ── Main component ───────────────────────────
export default function PlanSelectScreen({ route, navigation }) {
  const { user, policy } = route.params || {};
  const [selectedTier, setSelectedTier] = useState(policy?.plan_tier || 'standard');
  const [loading, setLoading] = useState(false);
  const [aiData, setAiData] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const { colors } = useTheme();

  const selectedPlan = PLANS.find(plan => plan.tier === selectedTier);
  const isViewMode = !!policy;

  // Fetch AI premium whenever tier changes
  useEffect(() => {
    if (isViewMode) return;
    let cancelled = false;
    setAiLoading(true);
    getAIPremium(user?.delivery_zone || 'OMR', user?.platform || 'Food', selectedTier)
      .then(data => { if (!cancelled) setAiData(data); })
      .catch(() => { if (!cancelled) setAiData(null); })
      .finally(() => { if (!cancelled) setAiLoading(false); });
    return () => { cancelled = true; };
  }, [selectedTier]);

  async function handleCreatePolicy() {
    setLoading(true);
    try {
      const newPolicy = await createPolicy({
        user_id: user.id,
        plan_tier: selectedTier,
      });
      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { user, policy: newPolicy } }],
      });
    } catch (error) {
      Alert.alert('Plan creation failed', error.message);
    } finally {
      setLoading(false);
    }
  }

  // Derived AI data
  const riskScore = aiData?.ai_risk_score ?? 0;
  const riskLevel = getRiskLevel(riskScore);
  const basePremium = selectedPlan?.premium ?? 0;
  const aiPremium = aiData?.weekly_premium_inr ?? 0;
  const premiumDiff = aiPremium - basePremium;
  const hasDisruption = aiData?.active_disruption && aiData.active_disruption !== 'None';

  return (
    <Screen contentStyle={styles.content}>
      <SectionHeading
        title={isViewMode ? 'Your policy' : 'Choose your plan'}
        subtitle={
          isViewMode
            ? `Your ${toTitleCase(policy.plan_tier)} Shield is currently active.`
            : 'Pick the cover that fits a normal riding week.'
        }
      />

      {/* ── User Risk Profile Card ── */}
      {user && (
        <AppCard variant="navy" style={styles.riskCard}>
          <View style={styles.riskHeader}>
            <View>
              <Text style={styles.riskLabel}>Risk score</Text>
              <Text style={styles.riskValue}>
                {formatPercentFromScore(user.risk_score)}
              </Text>
            </View>
            <AppPill label={user.city} tone="accent" />
          </View>
          <Text style={styles.riskNote}>{getRiskMessage(user.risk_score)}</Text>
          <View style={styles.riskMeta}>
            <RiskMetaItem label="Platform" value={toTitleCase(user.platform)} />
            <RiskMetaItem label="Zone" value={user.delivery_zone} />
            <RiskMetaItem label="Income" value={`₹${user.weekly_income}`} />
          </View>
        </AppCard>
      )}

      {/* ── Plan Cards ── */}
      {PLANS.map(plan => (
        <PlanOptionCard
          key={plan.tier}
          plan={plan}
          selected={plan.tier === selectedTier}
          onPress={() => !isViewMode && setSelectedTier(plan.tier)}
          disabled={isViewMode}
        />
      ))}

      {/* ── AI Risk Intelligence Panel ── */}
      {!isViewMode && (
        <View style={styles.aiSection}>
          <Text style={styles.aiSectionTitle}>🤖 AI Risk Intelligence</Text>
          <Text style={styles.aiSectionSubtitle}>
            Powered by CatBoost — real-time analysis of your zone, platform, and conditions
          </Text>

          {aiLoading ? (
            <AppCard variant="navy" style={styles.aiCard}>
              <ActivityIndicator color="#34D399" size="small" />
              <Text style={styles.aiLoadingText}>Analyzing risk factors...</Text>
            </AppCard>
          ) : aiData ? (
            <>
              {/* Risk Score Card */}
              <AppCard variant="navy" style={styles.aiCard}>
                <View style={styles.aiCardHeader}>
                  <Text style={styles.aiCardLabel}>AI Risk Score</Text>
                  <View style={styles.riskBadge}>
                    <Text style={{ fontSize: 10 }}>{riskLevel.emoji}</Text>
                    <Text style={[styles.riskBadgeText, { color: riskLevel.color }]}>
                      {riskLevel.label}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.aiScoreNumber, { color: riskLevel.color }]}>
                  {(riskScore * 100).toFixed(0)}%
                </Text>
                <RiskGauge score={riskScore} color={riskLevel.color} />
                <Text style={styles.aiScoreCaption}>
                  Based on {user?.delivery_zone || 'your zone'} conditions and {toTitleCase(user?.platform || 'your')} delivery patterns
                </Text>
              </AppCard>

              {/* Dynamic Premium Comparison */}
              <AppCard variant="navy" style={styles.aiCard}>
                <Text style={styles.aiCardLabel}>Dynamic Premium</Text>
                <View style={styles.premiumCompareRow}>
                  <View style={styles.premiumCol}>
                    <Text style={styles.premiumColLabel}>Base</Text>
                    <Text style={styles.premiumColValueBase}>
                      ₹{basePremium}
                    </Text>
                    <Text style={styles.premiumColSuffix}>/week</Text>
                  </View>
                  <View style={styles.premiumArrow}>
                    <Text style={{ color: '#64748B', fontSize: 18 }}>→</Text>
                  </View>
                  <View style={styles.premiumCol}>
                    <Text style={styles.premiumColLabel}>AI Adjusted</Text>
                    <Text style={[styles.premiumColValueAI, { color: riskLevel.color }]}>
                      ₹{aiPremium.toFixed(0)}
                    </Text>
                    <Text style={styles.premiumColSuffix}>/week</Text>
                  </View>
                </View>
                {premiumDiff !== 0 && (
                  <View style={[
                    styles.premiumDiffBadge,
                    { backgroundColor: premiumDiff > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)' },
                  ]}>
                    <Text style={[
                      styles.premiumDiffText,
                      { color: premiumDiff > 0 ? '#EF4444' : '#10B981' },
                    ]}>
                      {premiumDiff > 0 ? '▲' : '▼'} ₹{Math.abs(premiumDiff).toFixed(0)} {premiumDiff > 0 ? 'surge' : 'savings'} based on current conditions
                    </Text>
                  </View>
                )}
              </AppCard>

              {/* Zone Status */}
              <AppCard variant="navy" style={styles.aiCard}>
                <Text style={styles.aiCardLabel}>Zone Status</Text>
                <View style={styles.zoneStatusRow}>
                  <View style={styles.zoneStatusItem}>
                    <Text style={styles.zoneStatusEmoji}>📍</Text>
                    <Text style={styles.zoneStatusText}>{aiData.zone || user?.delivery_zone || '—'}</Text>
                  </View>
                  <View style={[
                    styles.zoneStatusPill,
                    { backgroundColor: hasDisruption ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)' },
                  ]}>
                    <Text style={{
                      color: hasDisruption ? '#EF4444' : '#10B981',
                      fontSize: 12,
                      fontWeight: '700',
                    }}>
                      {hasDisruption ? '⚠️ ' + aiData.active_disruption : '✅ Normal'}
                    </Text>
                  </View>
                </View>
                {hasDisruption && (
                  <Text style={styles.disruptionNote}>
                    Active disruption detected in your zone. Premium has been adjusted to reflect higher coverage risk.
                  </Text>
                )}
              </AppCard>
            </>
          ) : (
            <AppCard variant="navy" style={styles.aiCard}>
              <Text style={styles.aiErrorIcon}>📡</Text>
              <Text style={styles.aiErrorText}>
                AI analysis unavailable. Premiums will use standard pricing.
              </Text>
            </AppCard>
          )}
        </View>
      )}

      {/* ── Action Buttons ── */}
      {!isViewMode && (
        <>
          <AppButton
            label={
              aiData
                ? `Activate ${selectedPlan.label} · ₹${aiPremium.toFixed(0)}/wk`
                : `Activate ${selectedPlan.label}`
            }
            variant="accent"
            onPress={handleCreatePolicy}
            loading={loading}
          />
          <AppButton
            label="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
          />
        </>
      )}
    </Screen>
  );
}

// ── Helpers ───────────────────────────────────
function RiskMetaItem({ label, value }) {
  return (
    <View style={styles.riskMetaItem}>
      <Text style={styles.riskMetaLabel}>{label}</Text>
      <Text style={styles.riskMetaValue}>{value}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────
const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg },

  // Risk profile card
  riskCard: { marginBottom: spacing.lg },
  riskHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: spacing.md,
  },
  riskLabel: { color: '#94A3B8', fontSize: 13, marginBottom: 4 },
  riskValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '700' },
  riskNote: { color: '#94A3B8', fontSize: 14, lineHeight: 22, marginBottom: spacing.md },
  riskMeta: { flexDirection: 'row', flexWrap: 'wrap' },
  riskMetaItem: { width: '50%', marginBottom: spacing.sm },
  riskMetaLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 4 },
  riskMetaValue: { color: '#34D399', fontSize: 14, fontWeight: '600' },

  // AI section
  aiSection: { marginTop: spacing.md, marginBottom: spacing.lg },
  aiSectionTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  aiSectionSubtitle: { color: '#64748B', fontSize: 13, lineHeight: 20, marginBottom: spacing.md },
  aiCard: { marginBottom: spacing.sm },
  aiCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.xs,
  },
  aiCardLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs },
  aiLoadingText: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: spacing.sm },

  // Risk badge
  riskBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  riskBadgeText: { fontSize: 11, fontWeight: '700', marginLeft: 4 },

  // AI score
  aiScoreNumber: { fontSize: 42, fontWeight: '800', letterSpacing: -1 },
  aiScoreCaption: { color: '#475569', fontSize: 12, lineHeight: 18, marginTop: 4 },

  // Premium comparison
  premiumCompareRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  premiumCol: { alignItems: 'center', flex: 1 },
  premiumColLabel: { color: '#64748B', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  premiumColValueBase: { color: '#94A3B8', fontSize: 28, fontWeight: '700', textDecorationLine: 'line-through', textDecorationColor: '#475569' },
  premiumColValueAI: { fontSize: 32, fontWeight: '800' },
  premiumColSuffix: { color: '#475569', fontSize: 11, marginTop: 2 },
  premiumArrow: { paddingHorizontal: spacing.md },
  premiumDiffBadge: {
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12,
    alignItems: 'center', marginTop: spacing.xs,
  },
  premiumDiffText: { fontSize: 12, fontWeight: '600' },

  // Zone status
  zoneStatusRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.xs,
  },
  zoneStatusItem: { flexDirection: 'row', alignItems: 'center' },
  zoneStatusEmoji: { fontSize: 14, marginRight: 6 },
  zoneStatusText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  zoneStatusPill: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  disruptionNote: { color: '#94A3B8', fontSize: 12, lineHeight: 18, marginTop: spacing.sm },

  // Error state
  aiErrorIcon: { fontSize: 24, textAlign: 'center', marginBottom: spacing.xs },
  aiErrorText: { color: '#64748B', fontSize: 13, textAlign: 'center' },

  // Actions
  backBtn: { marginTop: spacing.sm },
});
