import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { changePolicy, createPaymentOrder, createPaymentQuote, getActivePolicy, getMe, verifyPayment } from '../../../services/api';
import { openRazorpayCheckout, isPaymentCancellation, getPaymentErrorMessage } from '../../../services/razorpayCheckout';
import { getRiskMessage, PLANS } from '../constants';
import PlanOptionCard from '../components/PlanOptionCard';
import { AppButton, AppCard, AppPill, Screen, SectionHeading } from '../../../shared/components';
import { radii, shadows, spacing } from '../../../shared/theme';
import { formatCurrency, formatPercentFromScore, toTitleCase } from '../../../shared/utils/format';
import { useTheme } from '../../../shared/theme/ThemeContext';

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
    height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden', marginTop: 8, marginBottom: 4,
  },
  fill: { height: 6, borderRadius: 3 },
});

function getRiskLevel(score) {
  if (score >= 0.7) return { label: 'High risk', color: '#EF4444', tone: 'danger' };
  if (score >= 0.4) return { label: 'Moderate', color: '#F59E0B', tone: 'warning' };
  return { label: 'Low risk', color: '#10B981', tone: 'success' };
}

function getStoredRiskScore(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return numeric <= 1 ? numeric * 100 : numeric;
}

// ── Change Policy Modal ──────────────────────────────────────────────────────
function ChangePolicyModal({ visible, currentTier, onClose, onChanged }) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState(currentTier || 'standard');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  async function handleChange() {
    if (selected === currentTier) {
      onClose();
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const updated = await changePolicy(selected);
      onChanged(updated);
      onClose();
    } catch (err) {
      // Rate-limit or other server error
      setErrorMsg(err.message || 'Policy change failed. Try again later.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.backdrop}>
        <View style={[modalStyles.sheet, { backgroundColor: colors.navy800 }]}>
          <Text style={modalStyles.title}>Change Plan</Text>
          <Text style={modalStyles.subtitle}>
            You can switch plans once every 7 days. Choose your new tier:
          </Text>

          {PLANS.map(plan => (
            <Pressable
              key={plan.tier}
              style={[
                modalStyles.option,
                {
                  borderColor: selected === plan.tier ? '#10B981' : 'rgba(255,255,255,0.12)',
                  backgroundColor: selected === plan.tier ? 'rgba(16,185,129,0.1)' : 'transparent',
                },
              ]}
              onPress={() => setSelected(plan.tier)}
            >
              <Text style={modalStyles.optionLabel}>{plan.label}</Text>
              <Text style={modalStyles.optionPremium}>₹{plan.premium}/week</Text>
              {plan.tier === currentTier && (
                <AppPill label="Current" tone="success" />
              )}
            </Pressable>
          ))}

          {errorMsg ? (
            <View style={modalStyles.errorBox}>
              <Text style={modalStyles.errorText}>⚠️ {errorMsg}</Text>
            </View>
          ) : null}

          <View style={modalStyles.actions}>
            <Pressable
              style={[modalStyles.btn, modalStyles.cancelBtn]}
              onPress={onClose}
              disabled={loading}
            >
              <Text style={modalStyles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[modalStyles.btn, { backgroundColor: '#10B981', opacity: loading ? 0.7 : 1 }]}
              onPress={handleChange}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#FFF" size="small" />
                : <Text style={modalStyles.confirmText}>
                    {selected === currentTier ? 'Keep plan' : 'Switch plan'}
                  </Text>
              }
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: spacing.lg, paddingBottom: 40 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 6 },
  subtitle: { color: '#94A3B8', fontSize: 13, lineHeight: 20, marginBottom: spacing.md },
  option: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, borderRadius: radii.md, borderWidth: 1.5, marginBottom: spacing.sm, gap: 8,
  },
  optionLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: 15, flex: 1 },
  optionPremium: { color: '#94A3B8', fontSize: 13 },
  errorBox: { backgroundColor: 'rgba(239,68,68,0.15)', borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  errorText: { color: '#FCA5A5', fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  btn: { flex: 1, height: 52, borderRadius: radii.md, justifyContent: 'center', alignItems: 'center' },
  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.08)' },
  cancelText: { color: '#94A3B8', fontWeight: '600' },
  confirmText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
});

// ── Main Policy Screen ───────────────────────────────────────────────────────
export default function PlanSelectScreen({ route, navigation }) {
  const [user, setUser] = useState(route.params?.user || null);
  const [policy, setPolicy] = useState(route.params?.policy || null);
  const [policyLoading, setPolicyLoading] = useState(!policy);
  const [selectedTier, setSelectedTier] = useState(policy?.plan_tier || 'standard');
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);

  const hasPolicy = Boolean(policy && policy.status === 'active');

  // ── Fetch active policy on focus ──────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      async function fetchPolicyAndProfile() {
        setPolicyLoading(true);
        try {
          const [session, active] = await Promise.all([
            getMe().catch(() => null),
            getActivePolicy().catch(() => null),
          ]);

          if (session?.id) {
            setUser(session);
          }

          const nextPolicy = active?.id ? active : (session?.active_policy || null);
          setPolicy(nextPolicy);
          if (nextPolicy?.plan_tier) {
            setSelectedTier(nextPolicy.plan_tier);
          }
        } catch (_) {
          // No policy or error — show plan picker
        } finally {
          setPolicyLoading(false);
        }
      }
      fetchPolicyAndProfile();
    }, [])
  );

  // ── Fetch AI quote (only in activation mode) ──────────────────────
  useEffect(() => {
    if (hasPolicy || !user?.id) return undefined;

    let cancelled = false;
    async function fetchQuote() {
      setQuoteLoading(true);
      setQuoteError('');
      try {
        const nextQuote = await createPaymentQuote({ user_id: user.id, plan_tier: selectedTier });
        if (!cancelled) setQuote(nextQuote);
      } catch (error) {
        if (!cancelled) { setQuote(null); setQuoteError(error.message); }
      } finally {
        if (!cancelled) setQuoteLoading(false);
      }
    }
    fetchQuote();
    return () => { cancelled = true; };
  }, [hasPolicy, selectedTier, user?.id]);

  // ── Payment activation ─────────────────────────────────────────────
  async function handleActivatePolicy() {
    if (!user?.id || !quote) return;
    setPaymentLoading(true);
    try {
      const order = await createPaymentOrder({ user_id: user.id, plan_tier: selectedTier, quote_id: quote.id });
      const checkoutResult = await openRazorpayCheckout(order, user);
      const verification = await verifyPayment({
        user_id: user.id,
        plan_tier: selectedTier,
        quote_id: quote.id,
        razorpay_order_id: checkoutResult.razorpay_order_id || order.order_id,
        razorpay_payment_id: checkoutResult.razorpay_payment_id,
        razorpay_signature: checkoutResult.razorpay_signature,
      });
      setPolicy(verification.policy);
      setSelectedTier(verification.policy?.plan_tier || selectedTier);
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

  // ── Policy was changed via modal ───────────────────────────────────
  function handlePolicyChanged(updated) {
    // Backend returns PolicyResponse directly (not wrapped in {policy: ...})
    if (updated?.id) {
      setPolicy(updated);
      setSelectedTier(updated.plan_tier);
    }
  }

  const storedRiskScore = getStoredRiskScore(user?.risk_score);
  const riskScore = quote?.ai_risk_score ?? storedRiskScore / 100;
  const riskLevel = getRiskLevel(riskScore);
  const selectedPlan = PLANS.find(p => p.tier === selectedTier);
  const basePremium = selectedPlan?.premium ?? 0;
  const quotedPremium = quote?.weekly_premium ?? basePremium;
  const premiumDiff = quotedPremium - basePremium;
  const hasDisruption = quote?.active_disruption && quote.active_disruption !== 'None';

  if (policyLoading) {
    return (
      <Screen scroll={false} contentStyle={styles.centered}>
        <ActivityIndicator color="#10B981" size="large" />
        <Text style={styles.loadingText}>Loading your policy…</Text>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.content}>
      <SectionHeading
        title={hasPolicy ? 'Your policy' : 'Choose your plan'}
        subtitle={
          hasPolicy
            ? `Your ${toTitleCase(policy.plan_tier)} Shield is active. You're covered.`
            : 'Pick the cover that fits a normal riding week and complete checkout to activate it.'
        }
      />

      {/* ── Active Policy Summary Card ─────────────────────────────── */}
      {hasPolicy && (
        <AppCard variant="navy" style={styles.policyCard}>
          <View style={styles.policyHeader}>
            <View>
              <Text style={styles.policyTierLabel}>{toTitleCase(policy.plan_tier)} Shield</Text>
              <Text style={styles.policyCoverage}>
                ₹{policy.daily_coverage}/day · max ₹{policy.max_weekly_payout}/week
              </Text>
            </View>
            <AppPill label="Active" tone="success" />
          </View>

          {policy.last_change_at || policy.activated_at ? (
            <Text style={styles.policyMeta}>
              Activated: {new Date(policy.activated_at || policy.last_change_at).toLocaleDateString('en-IN')}
            </Text>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.changeBtn, pressed && { opacity: 0.8 }]}
            onPress={() => setShowChangeModal(true)}
          >
            <Text style={styles.changeBtnText}>⚡ Change plan</Text>
          </Pressable>
        </AppCard>
      )}

      {/* ── Risk card (always shown when user available) ───────────── */}
      {user && (
        <AppCard variant="navy" style={styles.riskCard}>
          <View style={styles.riskHeader}>
            <View>
              <Text style={styles.riskLabel}>Risk score</Text>
              <Text style={styles.riskValue}>{formatPercentFromScore(storedRiskScore)}</Text>
            </View>
            <AppPill label={user.city} tone="accent" />
          </View>
          <Text style={styles.riskNote}>{getRiskMessage(storedRiskScore)}</Text>
          <View style={styles.riskMeta}>
            <RiskMetaItem label="Platform" value={toTitleCase(user.platform)} />
            <RiskMetaItem label="Zone" value={user.delivery_zone} />
            <RiskMetaItem label="Income" value={formatCurrency(user.weekly_income)} />
          </View>
        </AppCard>
      )}

      {/* ── Plan cards (selectable only in activation mode) ──────── */}
      {!hasPolicy && PLANS.map(plan => (
        <PlanOptionCard
          key={plan.tier}
          plan={plan}
          selected={plan.tier === selectedTier}
          onPress={() => setSelectedTier(plan.tier)}
        />
      ))}

      {/* ── AI Quote (only during activation) ────────────────────── */}
      {!hasPolicy && (
        <View style={styles.quoteSection}>
          <Text style={styles.quoteSectionTitle}>AI quote</Text>
          <Text style={styles.quoteSectionSubtitle}>
            Live premium calculated from your zone and platform risk.
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
                  <Text style={[styles.deltaText, { color: premiumDiff > 0 ? '#FCA5A5' : '#6EE7B7' }]}>
                    {premiumDiff > 0 ? 'Higher than base by ' : 'Lower than base by '}
                    {formatCurrency(Math.abs(premiumDiff))}
                  </Text>
                )}
              </AppCard>
              {hasDisruption && (
                <AppCard variant="navy" style={styles.quoteCard}>
                  <Text style={styles.quoteCardLabel}>Zone status</Text>
                  <View style={styles.zoneStatusRow}>
                    <Text style={styles.zoneValue}>{quote.zone}</Text>
                    <AppPill label={quote.active_disruption} tone="danger" />
                  </View>
                  <Text style={styles.zoneNote}>
                    Active disruption detected. The premium already reflects that risk.
                  </Text>
                </AppCard>
              )}
            </>
          ) : (
            <AppCard variant="navy" style={styles.quoteCard}>
              <Text style={styles.quoteErrorTitle}>Unable to prepare quote</Text>
              <Text style={styles.quoteErrorText}>{quoteError || 'Backend did not return a valid premium quote.'}</Text>
            </AppCard>
          )}
        </View>
      )}

      {/* ── Activate button (only in activation mode) ────────────── */}
      {!hasPolicy && (
        <>
          <AppButton
            label={quote ? `Pay ${formatCurrency(quote.weekly_premium)} and activate ${selectedPlan?.label}` : `Activate ${selectedPlan?.label}`}
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

      {/* ── Change Policy Modal ───────────────────────────────────── */}
      <ChangePolicyModal
        visible={showChangeModal}
        currentTier={policy?.plan_tier}
        onClose={() => setShowChangeModal(false)}
        onChanged={handlePolicyChanged}
      />
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
  content: { paddingTop: spacing.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#94A3B8', marginTop: spacing.md, fontSize: 14 },

  policyCard: { marginBottom: spacing.lg },
  policyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.sm },
  policyTierLabel: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  policyCoverage: { color: '#94A3B8', fontSize: 13 },
  policyMeta: { color: '#64748B', fontSize: 12, marginBottom: spacing.md },
  changeBtn: {
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.4)',
    borderRadius: radii.md, paddingVertical: 10, paddingHorizontal: spacing.md,
    alignSelf: 'flex-start',
  },
  changeBtnText: { color: '#34D399', fontWeight: '700', fontSize: 14 },

  riskCard: { marginBottom: spacing.lg },
  riskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  riskLabel: { color: '#94A3B8', fontSize: 13, marginBottom: 4 },
  riskValue: { color: '#FFFFFF', fontSize: 34, fontWeight: '700' },
  riskNote: { color: '#94A3B8', fontSize: 14, lineHeight: 22, marginBottom: spacing.md },
  riskMeta: { flexDirection: 'row', flexWrap: 'wrap' },
  riskMetaItem: { width: '50%', marginBottom: spacing.sm },
  riskMetaLabel: { color: '#94A3B8', fontSize: 12, marginBottom: 4 },
  riskMetaValue: { color: '#34D399', fontSize: 14, fontWeight: '600' },

  quoteSection: { marginTop: spacing.md, marginBottom: spacing.lg },
  quoteSectionTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginBottom: 4 },
  quoteSectionSubtitle: { color: '#64748B', fontSize: 13, lineHeight: 20, marginBottom: spacing.md },
  quoteCard: { marginBottom: spacing.sm },
  quoteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  quoteCardLabel: { color: '#94A3B8', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: spacing.xs },
  quoteLoadingText: { color: '#64748B', fontSize: 13, textAlign: 'center', marginTop: spacing.sm },
  quoteScore: { fontSize: 42, fontWeight: '800', letterSpacing: -1 },
  priceCompareRow: { flexDirection: 'row', marginVertical: spacing.sm },
  priceColumn: { flex: 1 },
  priceColumnLabel: { color: '#64748B', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 4 },
  priceBaseValue: { color: '#94A3B8', fontSize: 24, fontWeight: '700' },
  priceQuotedValue: { fontSize: 30, fontWeight: '800' },
  coverageRow: { flexDirection: 'row', marginTop: spacing.sm },
  coverageStat: { flex: 1 },
  coverageValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '700', marginBottom: 4 },
  coverageLabel: { color: '#94A3B8', fontSize: 12 },
  deltaText: { marginTop: spacing.sm, fontSize: 12, fontWeight: '600' },
  zoneStatusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs, gap: spacing.sm },
  zoneValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '600', flex: 1 },
  zoneNote: { color: '#94A3B8', fontSize: 12, lineHeight: 18, marginTop: spacing.sm },
  quoteErrorTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: spacing.xs },
  quoteErrorText: { color: '#94A3B8', fontSize: 13, lineHeight: 20 },
  backButton: { marginTop: spacing.sm, marginBottom: spacing.lg },
});
