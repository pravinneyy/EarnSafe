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

const POLL_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Status pill
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_CFG = {
  paid:      { label: 'Paid',       bg: 'rgba(16,185,129,0.15)',  text: '#34D399', dot: '#10B981' },
  approved:  { label: 'Approved',   bg: 'rgba(59,130,246,0.15)',  text: '#93C5FD', dot: '#3B82F6' },
  triggered: { label: 'Processing', bg: 'rgba(245,158,11,0.15)',  text: '#FCD34D', dot: '#F59E0B' },
  flagged:   { label: 'Flagged',    bg: 'rgba(239,68,68,0.15)',   text: '#FCA5A5', dot: '#EF4444' },
  rejected:  { label: 'Rejected',   bg: 'rgba(100,116,139,0.15)', text: '#94A3B8', dot: '#64748B' },
};

function StatusPill({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.rejected;
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

function fmtType(type) {
  if (!type) return '—';
  return type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─────────────────────────────────────────────────────────────────────────────
// Claim row
// ─────────────────────────────────────────────────────────────────────────────
function ClaimRow({ claim, colors }) {
  const d = new Date(claim.created_at);
  const isPaid = claim.status === 'paid';
  return (
    <View style={[row.wrap, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[row.iconBox, { backgroundColor: isPaid ? 'rgba(16,185,129,0.12)' : colors.surfaceMuted }]}>
        <Text style={row.icon}>{isPaid ? '💸' : '⏳'}</Text>
      </View>
      <View style={row.meta}>
        <Text style={[row.type, { color: colors.text }]}>{fmtType(claim.disruption_type)}</Text>
        <Text style={[row.date, { color: colors.textMuted }]}>
          {d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
          {' · '}
          {d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <View style={row.right}>
        <Text style={[row.amount, { color: isPaid ? '#10B981' : colors.textSecondary }]}>
          {isPaid ? '+' : ''}{formatCurrency(claim.claim_amount)}
        </Text>
        <StatusPill status={claim.status} />
      </View>
    </View>
  );
}
const row = StyleSheet.create({
  wrap:    { flexDirection: 'row', alignItems: 'center', padding: spacing.sm + 4, borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.xs + 2 },
  iconBox: { width: 40, height: 40, borderRadius: radii.sm, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  icon:    { fontSize: 18 },
  meta:    { flex: 1 },
  type:    { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  date:    { fontSize: 11 },
  right:   { alignItems: 'flex-end', marginLeft: spacing.sm },
  amount:  { fontSize: 15, fontWeight: '800', marginBottom: 4 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Stat card — fully theme-aware
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent, colors, style }) {
  const bg    = accent ? colors.accentSoft   : colors.surface;
  const bdr   = accent ? colors.accentBorder : colors.border;
  const valC  = accent ? colors.accent       : colors.text;
  const lblC  = accent ? colors.accent       : colors.textMuted;
  return (
    <View style={[sc.card, { backgroundColor: bg, borderColor: bdr }, style]}>
      <Text style={[sc.value, { color: valC }]}>{value}</Text>
      <Text style={[sc.label, { color: lblC }]}>{label}</Text>
      {sub ? <Text style={[sc.sub, { color: colors.textMuted }]}>{sub}</Text> : null}
    </View>
  );
}
const sc = StyleSheet.create({
  card:  { flex: 1, borderRadius: radii.md, borderWidth: 1, padding: spacing.md, ...shadows.sm },
  value: { fontSize: 20, fontWeight: '800', marginBottom: 2 },
  label: { fontSize: 12, fontWeight: '600' },
  sub:   { fontSize: 10, marginTop: 2 },
});

// ─────────────────────────────────────────────────────────────────────────────
// Weekly cap bar — theme-aware
// ─────────────────────────────────────────────────────────────────────────────
function CapBar({ earned, max, exhausted, isDark }) {
  const ratio = max > 0 ? Math.min(earned / max, 1) : 0;
  const pct   = Math.round(ratio * 100);
  const color = exhausted ? '#EF4444' : ratio > 0.75 ? '#F59E0B' : '#10B981';
  const muted = isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)';
  const track = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';

  return (
    <View>
      <View style={cb.header}>
        <Text style={[cb.label, { color: muted }]}>Weekly payout progress</Text>
        <Text style={[cb.pct, { color }]}>{pct}%</Text>
      </View>
      <View style={[cb.track, { backgroundColor: track }]}>
        <View style={[cb.fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <View style={cb.footer}>
        <Text style={[cb.earned, { color }]}>{formatCurrency(earned)} earned</Text>
        <Text style={[cb.cap, { color: muted }]}>cap {formatCurrency(max)}</Text>
      </View>
      {exhausted && (
        <View style={cb.banner}>
          <Text style={cb.bannerIcon}>⏸</Text>
          <Text style={cb.bannerText}>Weekly cap reached — claims resume next week</Text>
        </View>
      )}
    </View>
  );
}
const cb = StyleSheet.create({
  header:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label:      { fontSize: 12, fontWeight: '600' },
  pct:        { fontSize: 12, fontWeight: '800' },
  track:      { height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  fill:       { height: '100%', borderRadius: 3 },
  footer:     { flexDirection: 'row', justifyContent: 'space-between' },
  earned:     { fontSize: 11, fontWeight: '600' },
  cap:        { fontSize: 11 },
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
  const { colors, isDark } = useTheme();

  const pollRef     = useRef(null);
  const wsRef       = useRef(null);
  const prevBalance = useRef(null);
  const balPulse    = useRef(new Animated.Value(1)).current;

  // ── Load data ─────────────────────────────────────────────────────────────
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
            Animated.timing(balPulse, { toValue: 1.08, duration: 200, useNativeDriver: true }),
            Animated.timing(balPulse, { toValue: 1,    duration: 200, useNativeDriver: true }),
          ]).start();
        }
        prevBalance.current = bal;
        setSummary(summaryData);
      }
      if (claimsData) {
        setClaims([...claimsData].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      }
    } catch (_) {}
    finally { setLoading(false); }
  }, [balPulse]);

  const onRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); };

  // ── Poll + WebSocket ──────────────────────────────────────────────────────
  useFocusEffect(useCallback(() => {
    setLoading(true);
    loadData();
    pollRef.current = setInterval(loadData, POLL_MS);

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

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={s.center}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[s.loadText, { color: colors.textMuted }]}>Loading wallet…</Text>
      </Screen>
    );
  }

  const hasPolicy = summary?.max_weekly_payout != null;

  // Hero card colours adapt to theme
  const heroBase  = isDark ? '#071F14' : colors.accentSoft;
  const heroBdr   = isDark ? '#0D4228' : colors.accentBorder;
  const heroBalC  = isDark ? '#FFFFFF' : colors.text;
  const heroEyeC  = isDark ? '#34D399' : colors.accent;
  const heroTimeC = isDark ? 'rgba(255,255,255,0.40)' : colors.textMuted;
  const divider   = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  return (
    <Screen
      contentStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
    >
      {/* ════ HERO BALANCE CARD ══════════════════════════════════════════════ */}
      <View style={[s.hero, { backgroundColor: heroBase, borderColor: heroBdr }]}>
        {/* Top row */}
        <View style={s.heroTop}>
          <Text style={[s.heroEyebrow, { color: heroEyeC }]}>ACCOUNT BALANCE</Text>
          <View style={[s.liveBadge, { backgroundColor: colors.accentSoft }]}>
            <Animated.View style={[s.liveDot, { transform: [{ scale: balPulse }] }]} />
            <Text style={[s.liveLabel, { color: heroEyeC }]}>Live</Text>
          </View>
        </View>

        <Animated.Text style={[s.heroBalance, { color: heroBalC, transform: [{ scale: balPulse }] }]}>
          {formatCurrency(summary?.balance ?? 0)}
        </Animated.Text>

        <Text style={[s.heroTime, { color: heroTimeC }]}>
          {summary?.updated_at
            ? `Updated ${new Date(summary.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
            : 'EarnSafe Wallet · Pull to refresh'}
        </Text>

        {hasPolicy && (
          <>
            <View style={[s.heroDivider, { backgroundColor: divider }]} />
            <CapBar
              earned={summary.weekly_earned}
              max={summary.max_weekly_payout}
              exhausted={summary.cap_exhausted}
              isDark={isDark}
            />
          </>
        )}
      </View>

      {/* ════ STATS GRID ════════════════════════════════════════════════════ */}
      <View style={s.statsRow}>
        <StatCard label="Total Claims" value={`${summary?.total_claims ?? 0}`}    sub="all time"   colors={colors} style={s.statL} />
        <StatCard label="This Week"    value={`${summary?.weekly_claim_count ?? 0}`} sub="claims"  colors={colors} style={s.statR} />
      </View>
      <View style={s.statsRow}>
        <StatCard label="Week Earned" value={formatCurrency(summary?.weekly_earned ?? 0)} accent colors={colors} style={s.statL} />
        <StatCard
          label="Max / Week"
          value={hasPolicy ? formatCurrency(summary.max_weekly_payout) : '—'}
          sub={!hasPolicy ? 'no policy' : summary.cap_exhausted ? '⏸ cap reached' : 'your limit'}
          colors={colors}
          style={s.statR}
        />
      </View>

      {/* ════ CLAIM HISTORY ════════════════════════════════════════════════ */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Claim History</Text>
          <View style={[s.countBadge, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
            <Text style={[s.countText, { color: colors.textSecondary }]}>{claims.length}</Text>
          </View>
        </View>

        {claims.length === 0 ? (
          <View style={[s.empty, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={s.emptyIcon}>📭</Text>
            <Text style={[s.emptyTitle, { color: colors.text }]}>No claims yet</Text>
            <Text style={[s.emptyBody, { color: colors.textMuted }]}>
              Parametric claims are triggered automatically when a{'\n'}weather disruption hits your delivery zone.
            </Text>
          </View>
        ) : (
          claims.map(c => <ClaimRow key={c.id} claim={c} colors={colors} />)
        )}
      </View>

      <Text style={[s.footer, { color: colors.textMuted }]}>
        Auto-refreshes every 10 s · EarnSafe Parametric Insurance
      </Text>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  content:      { paddingBottom: spacing.xxl },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadText:     { fontSize: 14, marginTop: spacing.md },

  // Hero
  hero:         { borderRadius: radii.xl, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, ...shadows.elevated },
  heroTop:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  heroEyebrow:  { fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  liveBadge:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.full },
  liveDot:      { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981', marginRight: 5 },
  liveLabel:    { fontSize: 11, fontWeight: '700' },
  heroBalance:  { fontSize: 40, fontWeight: '800', letterSpacing: -1.5, marginBottom: 4, marginTop: 4 },
  heroTime:     { fontSize: 12, marginBottom: spacing.md },
  heroDivider:  { height: 1, marginBottom: spacing.md },

  // Stats
  statsRow:     { flexDirection: 'row', marginBottom: spacing.sm },
  statL:        { marginRight: spacing.xs },
  statR:        { marginLeft: spacing.xs },

  // Section
  section:       { marginTop: spacing.sm, marginBottom: spacing.lg },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle:  { fontSize: 17, fontWeight: '800', flex: 1 },
  countBadge:    { borderRadius: radii.full, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  countText:     { fontSize: 12, fontWeight: '700' },

  // Empty
  empty:         { borderRadius: radii.lg, borderWidth: 1, padding: spacing.xl, alignItems: 'center' },
  emptyIcon:     { fontSize: 38, marginBottom: spacing.sm },
  emptyTitle:    { fontSize: 16, fontWeight: '700', marginBottom: spacing.xs },
  emptyBody:     { fontSize: 13, lineHeight: 20, textAlign: 'center' },

  // Footer
  footer:        { fontSize: 11, textAlign: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
});
