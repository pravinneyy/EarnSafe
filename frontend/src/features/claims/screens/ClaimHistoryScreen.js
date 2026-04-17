import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { getUserClaims, getWallet, syncAutoClaims } from '../../../services/api';
import {
  AppCard,
  Screen,
  SectionHeading,
} from '../../../shared/components';
import { radii, shadows, spacing } from '../../../shared/theme';
import { useTheme } from '../../../shared/theme/ThemeContext';
import {
  formatCurrency,
  formatPercentFromRatio,
} from '../../../shared/utils/format';
import ClaimListItem from '../components/ClaimListItem';

const POLL_MS = 10_000;

export default function ClaimHistoryScreen({ route }) {
  const { user } = route.params || {};
  const [claims, setClaims] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useTheme();
  const pollRef = useRef(null);
  const prevBalance = useRef(null);
  const balancePulse = useRef(new Animated.Value(1)).current;

  // ── Load both wallet and claims ────────────────────────────────────
  async function loadData() {
    try {
      await syncAutoClaims().catch(() => null);

      const [claimsData, walletData] = await Promise.all([
        getUserClaims(),
        getWallet(),
      ]);

      // Sort newest first
      setClaims([...claimsData].sort((a, b) =>
        new Date(b.created_at) - new Date(a.created_at)
      ));

      // Pulse on balance change
      if (walletData) {
        const newBalance = Number(walletData.balance);
        if (prevBalance.current !== null && prevBalance.current !== newBalance) {
          Animated.sequence([
            Animated.timing(balancePulse, { toValue: 1.15, duration: 200, useNativeDriver: true }),
            Animated.timing(balancePulse, { toValue: 1, duration: 200, useNativeDriver: true }),
          ]).start();
        }
        prevBalance.current = newBalance;
        setWallet(walletData);
      }
    } catch (_) {
      // Silent fail on background polls — user will see stale data
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  // ── Poll while screen is focused ───────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();
      pollRef.current = setInterval(loadData, POLL_MS);
      return () => {
        clearInterval(pollRef.current);
      };
    }, [])
  );

  // ── Derived stats ──────────────────────────────────────────────────
  const paidClaims = claims.filter(c => c.status === 'paid' || c.status === 'approved');
  const totalPaid = paidClaims.reduce((s, c) => s + Number(c.claim_amount), 0);
  const approvalRatio = claims.length === 0 ? 0 : paidClaims.length / claims.length;

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.loadingState}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading wallet…</Text>
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={handleRefresh}
          tintColor={colors.accent}
        />
      }
      contentStyle={styles.screenContent}
    >
      <SectionHeading
        title="Wallet"
        subtitle={`Automated payouts for ${user?.name || 'you'}.`}
      />

      {/* ── Wallet Balance Card ────────────────────────────────────── */}
      {wallet ? (
        <View style={[styles.walletCard, {
          backgroundColor: colors.navy800,
          borderColor: colors.borderNavy || 'rgba(255,255,255,0.1)',
        }]}>
          <Text style={styles.walletLabel}>Current Balance</Text>
          <Animated.Text style={[
            styles.walletBalance,
            { color: '#34D399', transform: [{ scale: balancePulse }] },
          ]}>
            ₹{Number(wallet.balance).toFixed(2)}
          </Animated.Text>
          <Text style={styles.walletUpdated}>
            Updated: {new Date(wallet.updated_at).toLocaleTimeString('en-IN', {
              hour: '2-digit', minute: '2-digit',
            })}
          </Text>
          <View style={styles.liveRow}>
            <View style={[styles.liveDot, { backgroundColor: colors.accent }]} />
            <Text style={styles.liveText}>Live · refreshes every 10s</Text>
          </View>
        </View>
      ) : (
        <AppCard variant="muted">
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Wallet not found. Activate a policy to create your wallet.
          </Text>
        </AppCard>
      )}

      {/* ── Summary Stats ──────────────────────────────────────────── */}
      <View style={styles.statsRow}>
        <StatCard label="Total earned" value={formatCurrency(totalPaid)} accent />
        <StatCard label="Total claims" value={`${claims.length}`} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Paid" value={`${paidClaims.length}`} />
        <StatCard label="Success rate" value={formatPercentFromRatio(approvalRatio)} />
      </View>

      {/* ── Claims List ────────────────────────────────────────────── */}
      <SectionHeading
        title="Claim history"
        subtitle="Automatic claim activity — no action needed from you."
        style={styles.claimsHeading}
      />

      {claims.length === 0 ? (
        <AppCard variant="muted">
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No claims yet</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            When a weather disruption is detected in your delivery zone, a claim
            is automatically triggered and the payout is added to your wallet.
          </Text>
        </AppCard>
      ) : (
        claims.map(claim => <ClaimListItem key={claim.id} claim={claim} />)
      )}
    </Screen>
  );
}

function StatCard({ label, value, accent = false }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.statCard, {
      backgroundColor: accent ? colors.navy800 : colors.surface,
      borderColor: accent ? (colors.borderNavy || 'rgba(255,255,255,0.1)') : (colors.borderLight || '#E2E8F0'),
    }]}>
      <Text style={[styles.statValue, { color: accent ? '#34D399' : colors.text }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: accent ? '#94A3B8' : colors.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingTop: spacing.lg },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 14, marginTop: spacing.md },

  walletCard: {
    borderRadius: radii.lg || 12,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadows.elevated,
  },
  walletLabel: {
    color: '#94A3B8', fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6,
  },
  walletBalance: { fontSize: 42, fontWeight: '800', letterSpacing: -1, marginBottom: 4 },
  walletUpdated: { color: '#64748B', fontSize: 12, marginBottom: 8 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { color: '#64748B', fontSize: 11 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statCard: {
    flex: 1, borderRadius: radii.md || 8, padding: spacing.md,
    borderWidth: 1, ...shadows.sm,
  },
  statValue: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  statLabel: { fontSize: 13, fontWeight: '500' },

  claimsHeading: { marginTop: spacing.lg },
  emptyIcon: { fontSize: 32, textAlign: 'center', marginBottom: spacing.sm },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: spacing.xs },
  emptyText: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
});
