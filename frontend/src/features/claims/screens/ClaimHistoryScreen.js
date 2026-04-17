import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getUserClaims, getWalletSummary, syncAutoClaims } from '../../../services/api';
import { getSimulationWebSocketUrl } from '../../../services/config';
import { Screen } from '../../../shared/components';
import { radii, shadows, spacing } from '../../../shared/theme';
import { useTheme } from '../../../shared/theme/ThemeContext';
import { formatCurrency } from '../../../shared/utils/format';
import ClaimListItem from '../components/ClaimListItem';

const POLL_MS = 10_000;

// ── Status badge config ──────────────────────────────────────────────────────
const STATUS_CONFIG = {
  paid:      { label: 'Paid',      bg: '#064E3B', text: '#34D399', dot: '#10B981' },
  approved:  { label: 'Approved',  bg: '#1E3A5F', text: '#93C5FD', dot: '#3B82F6' },
  triggered: { label: 'Processing',bg: '#1C1A00', text: '#FCD34D', dot: '#F59E0B' },
  flagged:   { label: 'Flagged',   bg: '#3B1515', text: '#FCA5A5', dot: '#EF4444' },
  rejected:  { label: 'Rejected',  bg: '#1F1F1F', text: '#94A3B8', dot: '#64748B' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.rejected;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: cfg.dot }]} />
      <Text style={[styles.badgeText, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

// ── Disruption label formatter ────────────────────────────────────────────────
function formatDisruption(type) {
  if (!type) return 'Unknown';
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Claim row ─────────────────────────────────────────────────────────────────
function ClaimRow({ claim }) {
  const { colors } = useTheme();
  const date = new Date(claim.created_at);
  const dateStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
  const timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={[styles.claimRow, { backgroundColor: colors.surface, borderColor: colors.borderLight || '#E2E8F0' }]}>
      <View style={styles.claimLeft}>
        <Text style={[styles.claimType, { color: colors.text }]}>{formatDisruption(claim.disruption_type)}</Text>
        <Text style={[styles.claimDate, { color: colors.textMuted || '#64748B' }]}>{dateStr} · {timeStr}</Text>
      </View>
      <View style={styles.claimRight}>
        <Text style={[styles.claimAmount, { color: claim.status === 'paid' ? '#34D399' : colors.text }]}>
          {claim.status === 'paid' ? '+' : ''}{formatCurrency(claim.claim_amount)}
        </Text>
        <StatusBadge status={claim.status} />
      </View>
    </View>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, highlight, icon }) {
  const { colors } = useTheme();
  return (
    <View style={[
      styles.statCard,
      {
        backgroundColor: highlight ? '#0A2E1F' : colors.surface,
        borderColor: highlight ? '#065F46' : (colors.borderLight || '#E2E8F0'),
      },
    ]}>
      {icon ? <Text style={styles.statIcon}>{icon}</Text> : null}
      <Text style={[styles.statValue, { color: highlight ? '#34D399' : colors.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: highlight ? '#6EE7B7' : (colors.textMuted || '#64748B') }]}>{label}</Text>
      {sub ? <Text style={[styles.statSub, { color: colors.textMuted || '#94A3B8' }]}>{sub}</Text> : null}
    </View>
  );
}

// ── Weekly progress bar ────────────────────────────────────────────────────────
function WeeklyProgress({ earned, max, capExhausted }) {
  const ratio = max > 0 ? Math.min(earned / max, 1) : 0;
  const pct = Math.round(ratio * 100);
  const barColor = capExhausted ? '#EF4444' : ratio > 0.75 ? '#F59E0B' : '#10B981';

  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressHeader}>
        <Text style={styles.progressLabel}>This week's earnings</Text>
        <Text style={[styles.progressPct, { color: barColor }]}>{pct}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
      <View style={styles.progressFooter}>
        <Text style={styles.progressEarned}>{formatCurrency(earned)} earned</Text>
        <Text style={styles.progressMax}>cap {formatCurrency(max)}</Text>
      </View>
      {capExhausted && (
        <View style={styles.capBanner}>
          <Text style={styles.capIcon}>⏸</Text>
          <Text style={styles.capText}>Weekly cap reached — claims resume next week</Text>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function ClaimHistoryScreen({ route }) {
  const { user } = route.params || {};
  const [summary, setSummary] = useState(null);
  const [claims, setClaims]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { colors, isDark } = useTheme();

  const pollRef = useRef(null);
  const wsRef   = useRef(null);
  const prevBalance = useRef(null);
  const balancePulse = useRef(new Animated.Value(1)).current;

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      await syncAutoClaims().catch(() => null);

      const [summaryData, claimsData] = await Promise.all([
        getWalletSummary(),
        getUserClaims(),
      ]);

      // Pulse balance on change
      if (summaryData) {
        const newBal = summaryData.balance;
        if (prevBalance.current !== null && prevBalance.current !== newBal) {
          Animated.sequence([
            Animated.timing(balancePulse, { toValue: 1.12, duration: 180, useNativeDriver: true }),
            Animated.timing(balancePulse, { toValue: 1,    duration: 180, useNativeDriver: true }),
          ]).start();
        }
        prevBalance.current = newBal;
        setSummary(summaryData);
      }

      if (claimsData) {
        setClaims([...claimsData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      }
    } catch (_) {
      // Silent on background polls
    } finally {
      setLoading(false);
    }
  }, [balancePulse]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  // ── Poll + WebSocket ────────────────────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadData();

      pollRef.current = setInterval(loadData, POLL_MS);

      if (typeof WebSocket !== 'undefined') {
        const socket = new WebSocket(getSimulationWebSocketUrl());
        wsRef.current = socket;
        socket.onmessage = event => {
          try {
            const pl = JSON.parse(event.data);
            if (pl?.type === 'REFRESH_DATA') loadData();
          } catch (_) {}
        };
        socket.onclose = () => { if (wsRef.current === socket) wsRef.current = null; };
      }

      return () => {
        clearInterval(pollRef.current);
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      };
    }, [loadData])
  );

  // ── Loading state ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.loadingState}>
        <ActivityIndicator color="#10B981" size="large" />
        <Text style={[styles.loadingText, { color: colors.textMuted || '#94A3B8' }]}>Loading wallet…</Text>
      </Screen>
    );
  }

  const hasPolicy = summary?.max_weekly_payout != null;

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#10B981" />}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Balance Hero ──────────────────────────────────────────────── */}
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroLabel}>Account Balance</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Live</Text>
          </View>
        </View>

        <Animated.Text style={[styles.heroBalance, { transform: [{ scale: balancePulse }] }]}>
          {formatCurrency(summary?.balance ?? 0)}
        </Animated.Text>

        <Text style={styles.heroSub}>
          {summary?.updated_at
            ? `Updated ${new Date(summary.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
            : 'EarnSafe Wallet'}
        </Text>

        {/* Thin separator */}
        <View style={styles.heroDivider} />

        {/* Weekly progress */}
        {hasPolicy && (
          <WeeklyProgress
            earned={summary.weekly_earned}
            max={summary.max_weekly_payout}
            capExhausted={summary.cap_exhausted}
          />
        )}
      </View>

      {/* ── Stats Grid ───────────────────────────────────────────────── */}
      <View style={styles.statsGrid}>
        <StatCard
          icon="📋"
          label="Total Claims"
          value={`${summary?.total_claims ?? 0}`}
        />
        <StatCard
          icon="📅"
          label="This Week"
          value={`${summary?.weekly_claim_count ?? 0}`}
          sub="claims"
        />
        <StatCard
          icon="💰"
          label="Week Earned"
          value={formatCurrency(summary?.weekly_earned ?? 0)}
          highlight
        />
        <StatCard
          icon="🏦"
          label="Max / Week"
          value={hasPolicy ? formatCurrency(summary.max_weekly_payout) : '—'}
          sub={hasPolicy && summary.cap_exhausted ? 'cap reached' : hasPolicy ? 'limit' : 'no policy'}
        />
      </View>

      {/* ── Claim History ─────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Claim History</Text>
          <Text style={[styles.sectionCount, { color: colors.textMuted || '#94A3B8' }]}>
            {claims.length} total
          </Text>
        </View>

        {claims.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.surface, borderColor: colors.borderLight || '#E2E8F0' }]}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No claims yet</Text>
            <Text style={[styles.emptyBody, { color: colors.textMuted || '#94A3B8' }]}>
              Claims are triggered automatically when a weather disruption is detected in your delivery zone.
            </Text>
          </View>
        ) : (
          claims.map(claim => <ClaimRow key={claim.id} claim={claim} />)
        )}
      </View>

      <View style={styles.footer}>
        <Text style={[styles.footerText, { color: colors.textMuted || '#64748B' }]}>
          Refreshes every 10 s · Powered by EarnSafe
        </Text>
      </View>
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl * 2 },

  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText:  { fontSize: 14, marginTop: spacing.md },

  // ── Hero ──────────────────────────────────────────────────────────────────
  heroCard: {
    backgroundColor: '#0A2E1F',
    borderRadius: radii.xl || 20,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#065F46',
    ...shadows.elevated,
  },
  heroTopRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  heroLabel:   { color: '#6EE7B7', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  livePill:    { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  liveDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981', marginRight: 5 },
  liveText:    { color: '#34D399', fontSize: 11, fontWeight: '700' },

  heroBalance: { color: '#FFFFFF', fontSize: 48, fontWeight: '800', letterSpacing: -2, marginBottom: 4 },
  heroSub:     { color: '#4ADE80', fontSize: 12, opacity: 0.7, marginBottom: spacing.md },

  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: spacing.md },

  // Weekly progress
  progressContainer: {},
  progressHeader:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel:     { color: '#94A3B8', fontSize: 12, fontWeight: '600' },
  progressPct:       { fontSize: 12, fontWeight: '800' },
  progressTrack:     { height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill:      { height: '100%', borderRadius: 3 },
  progressFooter:    { flexDirection: 'row', justifyContent: 'space-between' },
  progressEarned:    { color: '#6EE7B7', fontSize: 11 },
  progressMax:       { color: '#64748B', fontSize: 11 },
  capBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 10, padding: 10,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderRadius: radii.md || 8,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)',
  },
  capIcon: { fontSize: 14, marginRight: 8 },
  capText: { color: '#FCA5A5', fontSize: 12, fontWeight: '600', flex: 1 },

  // ── Stats grid ────────────────────────────────────────────────────────────
  statsGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  statCard: {
    width: '47.5%',
    borderRadius: radii.lg || 14,
    borderWidth: 1,
    padding: spacing.md,
    ...shadows.sm,
  },
  statIcon:  { fontSize: 20, marginBottom: 6 },
  statValue: { fontSize: 22, fontWeight: '800', marginBottom: 2 },
  statLabel: { fontSize: 12, fontWeight: '600' },
  statSub:   { fontSize: 11, marginTop: 2 },

  // ── Section ────────────────────────────────────────────────────────────────
  section:       { marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle:  { fontSize: 18, fontWeight: '800' },
  sectionCount:  { fontSize: 13, fontWeight: '500' },

  // ── Claim row ─────────────────────────────────────────────────────────────
  claimRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.md || 10,
    borderWidth: 1,
    marginBottom: spacing.xs,
    ...shadows.sm,
  },
  claimLeft:   { flex: 1, marginRight: spacing.sm },
  claimType:   { fontSize: 14, fontWeight: '700', marginBottom: 3 },
  claimDate:   { fontSize: 11 },
  claimRight:  { alignItems: 'flex-end', gap: 6 },
  claimAmount: { fontSize: 16, fontWeight: '800' },

  // ── Badge ─────────────────────────────────────────────────────────────────
  badge:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeDot:  { width: 5, height: 5, borderRadius: 2.5, marginRight: 5 },
  badgeText: { fontSize: 11, fontWeight: '700' },

  // ── Empty ─────────────────────────────────────────────────────────────────
  emptyCard:  { borderRadius: radii.lg || 14, borderWidth: 1, padding: spacing.xl, alignItems: 'center' },
  emptyIcon:  { fontSize: 36, marginBottom: spacing.sm },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: spacing.xs },
  emptyBody:  { fontSize: 13, lineHeight: 20, textAlign: 'center' },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer:     { alignItems: 'center', marginTop: spacing.lg },
  footerText: { fontSize: 11 },
});
