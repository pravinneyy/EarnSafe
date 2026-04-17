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
import { darkColors, radii, shadows, spacing } from '../../../shared/theme';
import { useTheme } from '../../../shared/theme/ThemeContext';
import { formatCurrency } from '../../../shared/utils/format';

const POLL_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const STATUS = {
  paid:      { label: 'Paid',       bg: 'rgba(16,185,129,0.15)',  text: '#34D399', dot: '#10B981' },
  approved:  { label: 'Approved',   bg: 'rgba(59,130,246,0.15)',  text: '#93C5FD', dot: '#3B82F6' },
  triggered: { label: 'Processing', bg: 'rgba(245,158,11,0.15)',  text: '#FCD34D', dot: '#F59E0B' },
  flagged:   { label: 'Flagged',    bg: 'rgba(239,68,68,0.15)',   text: '#FCA5A5', dot: '#EF4444' },
  rejected:  { label: 'Rejected',   bg: 'rgba(100,116,139,0.15)', text: '#94A3B8', dot: '#64748B' },
};

function StatusPill({ status }) {
  const cfg = STATUS[status] || STATUS.rejected;
  return (
    <View style={[pill.wrap, { backgroundColor: cfg.bg }]}>
      <View style={[pill.dot, { backgroundColor: cfg.dot }]} />
      <Text style={[pill.label, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}
const pill = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.full },
  dot:   { width: 5, height: 5, borderRadius: 3, marginRight: 5 },
  label: { fontSize: 11, fontWeight: '700' },
});

function fmt(type) {
  if (!type) return '—';
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Claim row ────────────────────────────────────────────────────────────────
function ClaimRow({ claim, colors }) {
  const d = new Date(claim.created_at);
  const isPaid = claim.status === 'paid';
  return (
    <View style={[row.wrap, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
      {/* Left: type icon + meta */}
      <View style={[row.iconBox, { backgroundColor: isPaid ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.10)' }]}>
        <Text style={row.icon}>{isPaid ? '💸' : '⏳'}</Text>
      </View>
      <View style={row.meta}>
        <Text style={[row.type, { color: colors.text }]}>{fmt(claim.disruption_type)}</Text>
        <Text style={[row.date, { color: colors.textMuted }]}>
          {d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          {' · '}
          {d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      {/* Right: amount + badge */}
      <View style={row.right}>
        <Text style={[row.amount, { color: isPaid ? '#34D399' : colors.textSecondary }]}>
          {isPaid ? '+' : ''}{formatCurrency(claim.claim_amount)}
        </Text>
        <StatusPill status={claim.status} />
      </View>
    </View>
  );
}
const row = StyleSheet.create({
  wrap:   { flexDirection: 'row', alignItems: 'center', padding: spacing.sm + 4, borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.xs + 2 },
  iconBox:{ width: 40, height: 40, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  icon:   { fontSize: 18 },
  meta:   { flex: 1 },
  type:   { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  date:   { fontSize: 11 },
  right:  { alignItems: 'flex-end', marginLeft: spacing.sm },
  amount: { fontSize: 15, fontWeight: '800', marginBottom: 4 },
});

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, colors, style }) {
  return (
    <View style={[
      stat.card,
      {
        backgroundColor: accent ? 'rgba(16,185,129,0.10)' : colors.surface,
        borderColor: accent ? 'rgba(16,185,129,0.30)' : colors.borderLight,
      },
      style,
    ]}>
      <Text style={[stat.value, { color: accent ? '#34D399' : colors.text }]}>{value}</Text>
      <Text style={[stat.label, { color: accent ? '#6EE7B7' : colors.textMuted }]}>{label}</Text>
      {sub ? <Text style={[stat.sub, { color: colors.textMuted }]}>{sub}</Text> : null}
    </View>
  );
}
const stat = StyleSheet.create({
  card:  { flex: 1, borderRadius: radii.md, borderWidth: 1, padding: spacing.md, ...shadows.sm },
  value: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  label: { fontSize: 12, fontWeight: '600' },
  sub:   { fontSize: 10, marginTop: 2 },
});

// ─── Weekly cap bar ───────────────────────────────────────────────────────────
function CapBar({ earned, max, exhausted }) {
  const ratio = max > 0 ? Math.min(earned / max, 1) : 0;
  const pct   = Math.round(ratio * 100);
  const color = exhausted ? '#EF4444' : ratio > 0.75 ? '#F59E0B' : '#10B981';

  return (
    <View>
      <View style={bar.header}>
        <Text style={bar.label}>Weekly payout progress</Text>
        <Text style={[bar.pct, { color }]}>{pct}%</Text>
      </View>
      <View style={bar.track}>
        <View style={[bar.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <View style={bar.footer}>
        <Text style={bar.earned}>{formatCurrency(earned)} earned</Text>
        <Text style={bar.cap}>cap {formatCurrency(max)}</Text>
      </View>
      {exhausted && (
        <View style={bar.banner}>
          <Text style={bar.bannerIcon}>⏸</Text>
          <Text style={bar.bannerText}>Weekly cap reached — claims resume next week</Text>
        </View>
      )}
    </View>
  );
}
const bar = StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label:      { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  pct:        { fontSize: 12, fontWeight: '800' },
  track:      { height: 5, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  fill:       { height: '100%', borderRadius: 3 },
  footer:     { flexDirection: 'row', justifyContent: 'space-between' },
  earned:     { color: '#6EE7B7', fontSize: 11 },
  cap:        { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  banner:     { flexDirection: 'row', alignItems: 'center', marginTop: 10, padding: 10, backgroundColor: 'rgba(239,68,68,0.12)', borderRadius: radii.sm, borderWidth: 1, borderColor: 'rgba(239,68,68,0.30)' },
  bannerIcon: { fontSize: 13, marginRight: 7 },
  bannerText: { color: '#FCA5A5', fontSize: 12, fontWeight: '600', flex: 1 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export default function ClaimHistoryScreen() {
  const [summary,    setSummary]    = useState(null);
  const [claims,     setClaims]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { colors }  = useTheme();

  const pollRef     = useRef(null);
  const wsRef       = useRef(null);
  const prevBalance = useRef(null);
  const balPulse    = useRef(new Animated.Value(1)).current;

  // ── data ────────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      await syncAutoClaims().catch(() => null);

      const [summaryData, claimsData] = await Promise.all([
        getWalletSummary(),
        getUserClaims(),
      ]);

      if (summaryData) {
        const bal = summaryData.balance;
        if (prevBalance.current !== null && prevBalance.current !== bal) {
          Animated.sequence([
            Animated.timing(balPulse, { toValue: 1.10, duration: 200, useNativeDriver: true }),
            Animated.timing(balPulse, { toValue: 1,    duration: 200, useNativeDriver: true }),
          ]).start();
        }
        prevBalance.current = bal;
        setSummary(summaryData);
      }

      if (claimsData) {
        setClaims([...claimsData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      }
    } catch (_) { /* silent background poll */ }
    finally { setLoading(false); }
  }, [balPulse]);

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  // ── poll + ws ───────────────────────────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadData();
    pollRef.current = setInterval(loadData, POLL_MS);

    // WebSocket for instant push from simulation
    const wsUrl = getSimulationWebSocketUrl?.();
    if (wsUrl && typeof WebSocket !== 'undefined') {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onmessage = e => { try { if (JSON.parse(e.data)?.type === 'REFRESH_DATA') loadData(); } catch (_) {} };
      ws.onclose   = () => { if (wsRef.current === ws) wsRef.current = null; };
    }

    return () => {
      clearInterval(pollRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [loadData]));

  // ── loading ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Screen scroll={false} contentStyle={s.center}>
        <ActivityIndicator color="#10B981" size="large" />
        <Text style={[s.loadText, { color: colors.textMuted }]}>Loading wallet…</Text>
      </Screen>
    );
  }

  const hasPolicy = summary?.max_weekly_payout != null;

  return (
    <ScrollView
      style={[s.root, { backgroundColor: colors.background }]}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10B981" />}
      showsVerticalScrollIndicator={false}
    >
      {/* ════ HERO BALANCE CARD ════════════════════════════════════════════════ */}
      <View style={s.hero}>
        {/* Top row */}
        <View style={s.heroTop}>
          <Text style={s.heroEyebrow}>ACCOUNT BALANCE</Text>
          <View style={s.liveBadge}>
            <Animated.View style={[s.liveDot, { transform: [{ scale: balPulse }] }]} />
            <Text style={s.liveLabel}>Live</Text>
          </View>
        </View>

        {/* Big balance number */}
        <Animated.Text style={[s.heroBalance, { transform: [{ scale: balPulse }] }]}>
          {formatCurrency(summary?.balance ?? 0)}
        </Animated.Text>

        <Text style={s.heroTime}>
          {summary?.updated_at
            ? `Updated ${new Date(summary.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
            : 'EarnSafe Wallet · Pull to refresh'}
        </Text>

        {hasPolicy && (
          <>
            <View style={s.heroDivider} />
            <CapBar
              earned={summary.weekly_earned}
              max={summary.max_weekly_payout}
              exhausted={summary.cap_exhausted}
            />
          </>
        )}
      </View>

      {/* ════ STATS ROW ═══════════════════════════════════════════════════════ */}
      <View style={s.statsRow}>
        <StatCard
          label="Total Claims"
          value={`${summary?.total_claims ?? 0}`}
          sub="all time"
          colors={colors}
          style={s.statLeft}
        />
        <StatCard
          label="This Week"
          value={`${summary?.weekly_claim_count ?? 0}`}
          sub="claims"
          colors={colors}
          style={s.statRight}
        />
      </View>
      <View style={s.statsRow}>
        <StatCard
          label="Week Earned"
          value={formatCurrency(summary?.weekly_earned ?? 0)}
          accent
          colors={colors}
          style={s.statLeft}
        />
        <StatCard
          label="Max / Week"
          value={hasPolicy ? formatCurrency(summary.max_weekly_payout) : '—'}
          sub={
            !hasPolicy             ? 'no policy'
            : summary.cap_exhausted ? '⏸ cap reached'
            : 'your limit'
          }
          colors={colors}
          style={s.statRight}
        />
      </View>

      {/* ════ CLAIM HISTORY ════════════════════════════════════════════════════ */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Claim History</Text>
          <View style={[s.countBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.borderLight }]}>
            <Text style={[s.countText, { color: colors.textSecondary }]}>{claims.length}</Text>
          </View>
        </View>

        {claims.length === 0 ? (
          <View style={[s.empty, { backgroundColor: colors.surface, borderColor: colors.borderLight }]}>
            <Text style={s.emptyIcon}>📭</Text>
            <Text style={[s.emptyTitle, { color: colors.text }]}>No claims yet</Text>
            <Text style={[s.emptyBody, { color: colors.textMuted }]}>
              Parametric claims are triggered automatically when a{'\n'}
              weather disruption hits your delivery zone.
            </Text>
          </View>
        ) : (
          claims.map(c => <ClaimRow key={c.id} claim={c} colors={colors} />)
        )}
      </View>

      <Text style={[s.footer, { color: colors.textMuted }]}>
        Auto-refreshes every 10 s · EarnSafe Parametric Insurance
      </Text>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:    { flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xxl },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadText:{ fontSize: 14, marginTop: spacing.md },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: '#071F14',
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#0D4228',
    ...shadows.elevated,
  },
  heroTop:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  heroEyebrow: { color: '#34D399', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  liveBadge:   { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(16,185,129,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.full },
  liveDot:     { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981', marginRight: 5 },
  liveLabel:   { color: '#34D399', fontSize: 11, fontWeight: '700' },
  heroBalance: { color: '#FFFFFF', fontSize: 44, fontWeight: '800', letterSpacing: -1.5, marginBottom: 4, marginTop: 4 },
  heroTime:    { color: 'rgba(255,255,255,0.40)', fontSize: 12, marginBottom: spacing.md },
  heroDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginBottom: spacing.md },

  // ── Stats ─────────────────────────────────────────────────────────────────
  statsRow:  { flexDirection: 'row', marginBottom: spacing.sm },
  statLeft:  { marginRight: spacing.sm / 2 },
  statRight: { marginLeft: spacing.sm / 2 },

  // ── Section ───────────────────────────────────────────────────────────────
  section:       { marginTop: spacing.sm, marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle:  { fontSize: 17, fontWeight: '800', flex: 1 },
  countBadge:    { borderRadius: radii.full, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  countText:     { fontSize: 12, fontWeight: '700' },

  // ── Empty ─────────────────────────────────────────────────────────────────
  empty:      { borderRadius: radii.lg, borderWidth: 1, padding: spacing.xl, alignItems: 'center' },
  emptyIcon:  { fontSize: 38, marginBottom: spacing.sm },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginBottom: spacing.xs },
  emptyBody:  { fontSize: 13, lineHeight: 20, textAlign: 'center' },

  // ── Footer ────────────────────────────────────────────────────────────────
  footer: { fontSize: 11, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
});
