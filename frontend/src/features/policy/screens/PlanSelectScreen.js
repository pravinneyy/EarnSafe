import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { createPaymentOrder, createPaymentQuote, verifyPayment } from '../../../services/api';
import { openRazorpayCheckout, isPaymentCancellation, getPaymentErrorMessage } from '../../../services/razorpayCheckout';
import { getRiskMessage, PLANS } from '../constants';
import PlanOptionCard from '../components/PlanOptionCard';
import { AppButton, AppCard, AppPill, Screen, SectionHeading } from '../../../shared/components';
import { spacing } from '../../../shared/theme';
import { formatCurrency, formatPercentFromScore, toTitleCase } from '../../../shared/utils/format';

function RiskGauge({ score, color }) {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: score,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [animatedValue, score]);

  const width = animatedValue.interpolate({
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

function getRiskLevel(score) {
  if (score >= 0.7) {
    return { label: 'High risk', color: '#EF4444', tone: 'danger' };
  }
  if (score >= 0.4) {
    return { label: 'Moderate', color: '#F59E0B', tone: 'warning' };
  }
  return { label: 'Low risk', color: '#10B981', tone: 'success' };
}

export default function PlanSelectScreen({ route, navigation }) {
  const { user, policy } = route.params || {};
  const [selectedTier, setSelectedTier] = useState(policy?.plan_tier || 'standard');
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  const selectedPlan = PLANS.find(plan => plan.tier === selectedTier);
  const isViewMode = Boolean(policy);

  useEffect(() => {
    if (isViewMode || !user?.id) {
      return undefined;
    }

    let cancelled = false;

    async function fetchQuote() {
      setQuoteLoading(true);
      setQuoteError('');

      try {
        const nextQuote = await createPaymentQuote({
          user_id: user.id,
          plan_tier: selectedTier,
        });

        if (!cancelled) {
          setQuote(nextQuote);
        }
      } catch (error) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(error.message);
        }
      } finally {
        if (!cancelled) {
          setQuoteLoading(false);
        }
      }
    }

    fetchQuote();
    return () => {
      cancelled = true;
    };
  }, [isViewMode, selectedTier, user?.id]);

  async function handleActivatePolicy() {
    if (!user?.id || !selectedPlan) {
      return;
    }

    if (!quote) {
      Alert.alert('Quote unavailable', 'Refresh the quote before starting the payment.');
      return;
    }

    setPaymentLoading(true);

    try {
      const order = await createPaymentOrder({
        user_id: user.id,
        plan_tier: selectedTier,
        quote_id: quote.id,
      });

      const checkoutResult = await openRazorpayCheckout(order, user);
      const verification = await verifyPayment({
        user_id: user.id,
        plan_tier: selectedTier,
        quote_id: quote.id,
        razorpay_order_id: checkoutResult.razorpay_order_id || order.order_id,
        razorpay_payment_id: checkoutResult.razorpay_payment_id,
        razorpay_signature: checkoutResult.razorpay_signature,
      });

      navigation.reset({
        index: 0,
        routes: [{ name: 'Main', params: { user, policy: verification.policy } }],
      });
    } catch (error) {
      if (isPaymentCancellation(error)) {
        Alert.alert('Payment cancelled', 'Your plan was not activated.');
      } else {
        Alert.alert('Payment failed', getPaymentErrorMessage(error));
      }
    } finally {
      setPaymentLoading(false);
    }
  }

  const riskScore = quote?.ai_risk_score ?? 0;
  const riskLevel = getRiskLevel(riskScore);
  const basePremium = selectedPlan?.premium ?? 0;
  const quotedPremium = quote?.weekly_premium ?? basePremium;
  const premiumDiff = quotedPremium - basePremium;
  const hasDisruption = quote?.active_disruption && quote.active_disruption !== 'None';

  return (
    <Screen contentStyle={styles.content}>
      <SectionHeading
        title={isViewMode ? 'Your policy' : 'Choose your plan'}
        subtitle={
          isViewMode
            ? `Your ${toTitleCase(policy.plan_tier)} Shield is currently active.`
            : 'Pick the cover that fits a normal riding week and complete checkout to activate it.'
        }
      />

      {user && (
        <AppCard variant="navy" style={styles.riskCard}>
          <View style={styles.riskHeader}>
            <View>
              <Text style={styles.riskLabel}>Risk score</Text>
              <Text style={styles.riskValue}>{formatPercentFromScore(user.risk_score)}</Text>
            </View>
            <AppPill label={user.city} tone="accent" />
          </View>
          <Text style={styles.riskNote}>{getRiskMessage(user.risk_score)}</Text>
          <View style={styles.riskMeta}>
            <RiskMetaItem label="Platform" value={toTitleCase(user.platform)} />
            <RiskMetaItem label="Zone" value={user.delivery_zone} />
            <RiskMetaItem label="Income" value={formatCurrency(user.weekly_income)} />
          </View>
        </AppCard>
      )}

      {PLANS.map(plan => (
        <PlanOptionCard
          key={plan.tier}
          plan={plan}
          selected={plan.tier === selectedTier}
          onPress={() => !isViewMode && setSelectedTier(plan.tier)}
          disabled={isViewMode}
        />
      ))}

      {!isViewMode && (
        <View style={styles.quoteSection}>
          <Text style={styles.quoteSectionTitle}>AI quote</Text>
          <Text style={styles.quoteSectionSubtitle}>
            The amount below is what the backend will use to create the Razorpay sandbox order.
          </Text>

          {quoteLoading ? (
            <AppCard variant="navy" style={styles.quoteCard}>
              <ActivityIndicator color="#34D399" size="small" />
              <Text style={styles.quoteLoadingText}>Preparing live quote...</Text>
            </AppCard>
          ) : quote ? (
            <>
              <AppCard variant="navy" style={styles.quoteCard}>
                <View style={styles.quoteHeader}>
                  <Text style={styles.quoteCardLabel}>Risk assessment</Text>
                  <AppPill label={riskLevel.label} tone={riskLevel.tone} />
                </View>
                <Text style={[styles.quoteScore, { color: riskLevel.color }]}>
                  {(riskScore * 100).toFixed(0)}%
                </Text>
                <RiskGauge score={riskScore} color={riskLevel.color} />
                <Text style={styles.quoteCaption}>
                  Based on {quote.zone} conditions and {toTitleCase(user?.platform || 'delivery')} activity.
                </Text>
              </AppCard>

              <AppCard variant="navy" style={styles.quoteCard}>
                <Text style={styles.quoteCardLabel}>Weekly premium</Text>
                <View style={styles.priceCompareRow}>
                  <View style={styles.priceColumn}>
                    <Text style={styles.priceColumnLabel}>Base plan</Text>
                    <Text style={styles.priceBaseValue}>{formatCurrency(basePremium)}</Text>
                  </View>
                  <View style={styles.priceColumn}>
                    <Text style={styles.priceColumnLabel}>Pay now</Text>
                    <Text style={[styles.priceQuotedValue, { color: riskLevel.color }]}>
                      {formatCurrency(quotedPremium)}
                    </Text>
                  </View>
                </View>
                <View style={styles.coverageRow}>
                  <CoverageStat label="Daily cover" value={formatCurrency(quote.daily_coverage)} />
                  <CoverageStat label="Max payout" value={formatCurrency(quote.max_weekly_payout)} />
                </View>
                {premiumDiff !== 0 && (
                  <Text
                    style={[
                      styles.deltaText,
                      { color: premiumDiff > 0 ? '#FCA5A5' : '#6EE7B7' },
                    ]}
                  >
                    {premiumDiff > 0 ? 'Higher than base by ' : 'Lower than base by '}
                    {formatCurrency(Math.abs(premiumDiff))}
                  </Text>
                )}
              </AppCard>

              <AppCard variant="navy" style={styles.quoteCard}>
                <Text style={styles.quoteCardLabel}>Zone status</Text>
                <View style={styles.zoneStatusRow}>
                  <Text style={styles.zoneValue}>{quote.zone}</Text>
                  <AppPill
                    label={hasDisruption ? quote.active_disruption : 'Normal'}
                    tone={hasDisruption ? 'danger' : 'success'}
                  />
                </View>
                <Text style={styles.zoneNote}>
                  {hasDisruption
                    ? 'Active disruption detected for this quote window. The premium already reflects that risk.'
                    : 'No active disruption was detected for this quote window.'}
                </Text>
              </AppCard>
            </>
          ) : (
            <AppCard variant="navy" style={styles.quoteCard}>
              <Text style={styles.quoteErrorTitle}>Unable to prepare quote</Text>
              <Text style={styles.quoteErrorText}>
                {quoteError || 'The backend did not return a valid premium quote.'}
              </Text>
            </AppCard>
          )}
        </View>
      )}

      {!isViewMode && (
        <>
          <AppButton
            label={
              quote
                ? `Pay ${formatCurrency(quote.weekly_premium)} and activate ${selectedPlan.label}`
                : `Activate ${selectedPlan.label}`
            }
            variant="accent"
            onPress={handleActivatePolicy}
            loading={paymentLoading}
            disabled={!quote || quoteLoading}
          />
          <AppButton
            label="Back"
            variant="secondary"
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          />
        </>
      )}
    </Screen>
  );
}

function RiskMetaItem({ label, value }) {
  return (
    <View style={styles.riskMetaItem}>
      <Text style={styles.riskMetaLabel}>{label}</Text>
      <Text style={styles.riskMetaValue}>{value}</Text>
    </View>
  );
}

function CoverageStat({ label, value }) {
  return (
    <View style={styles.coverageStat}>
      <Text style={styles.coverageValue}>{value}</Text>
      <Text style={styles.coverageLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: spacing.lg,
  },
  riskCard: {
    marginBottom: spacing.lg,
  },
  riskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  riskLabel: {
    color: '#94A3B8',
    fontSize: 13,
    marginBottom: 4,
  },
  riskValue: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '700',
  },
  riskNote: {
    color: '#94A3B8',
    fontSize: 14,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  riskMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  riskMetaItem: {
    width: '50%',
    marginBottom: spacing.sm,
  },
  riskMetaLabel: {
    color: '#94A3B8',
    fontSize: 12,
    marginBottom: 4,
  },
  riskMetaValue: {
    color: '#34D399',
    fontSize: 14,
    fontWeight: '600',
  },
  quoteSection: {
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  quoteSectionTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  quoteSectionSubtitle: {
    color: '#64748B',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  quoteCard: {
    marginBottom: spacing.sm,
  },
  quoteHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  quoteCardLabel: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.xs,
  },
  quoteLoadingText: {
    color: '#64748B',
    fontSize: 13,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  quoteScore: {
    fontSize: 42,
    fontWeight: '800',
    letterSpacing: -1,
  },
  quoteCaption: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
  },
  priceCompareRow: {
    flexDirection: 'row',
    marginVertical: spacing.sm,
  },
  priceColumn: {
    flex: 1,
  },
  priceColumnLabel: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  priceBaseValue: {
    color: '#94A3B8',
    fontSize: 24,
    fontWeight: '700',
  },
  priceQuotedValue: {
    fontSize: 30,
    fontWeight: '800',
  },
  coverageRow: {
    flexDirection: 'row',
    marginTop: spacing.sm,
  },
  coverageStat: {
    flex: 1,
  },
  coverageValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  coverageLabel: {
    color: '#94A3B8',
    fontSize: 12,
  },
  deltaText: {
    marginTop: spacing.sm,
    fontSize: 12,
    fontWeight: '600',
  },
  zoneStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  zoneValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  zoneNote: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  quoteErrorTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  quoteErrorText: {
    color: '#94A3B8',
    fontSize: 13,
    lineHeight: 20,
  },
  backButton: {
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
});