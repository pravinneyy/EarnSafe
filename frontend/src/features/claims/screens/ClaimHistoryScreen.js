import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getUserClaims } from '../../../services/api';
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

export default function ClaimHistoryScreen({ route }) {
  const { user, policy } = route.params || {};
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { colors } = useTheme();

  async function loadClaims() {
    if (!user?.id) return;
    try {
      const data = await getUserClaims(user.id);
      setClaims([...data].sort((a, b) => b.id - a.id));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClaims();
  }, [user?.id]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadClaims();
    setRefreshing(false);
  }

  const approvedClaims = claims.filter(c => c.status === 'approved');
  const totalPaid = approvedClaims.reduce((s, c) => s + c.claim_amount, 0);
  const approvalRatio = claims.length === 0 ? 0 : approvedClaims.length / claims.length;

  if (loading) {
    return (
      <Screen scroll={false} contentStyle={styles.loadingState}>
        <ActivityIndicator color={colors.accent} size="large" />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>Loading claims...</Text>
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

      {/* Summary Stats */}
      <View style={styles.statsRow}>
        <StatCard label="Total paid" value={formatCurrency(totalPaid)} accent />
        <StatCard label="Claims" value={`${claims.length}`} />
      </View>
      <View style={styles.statsRow}>
        <StatCard label="Approved" value={`${approvedClaims.length}`} />
        <StatCard label="Approval rate" value={formatPercentFromRatio(approvalRatio)} />
      </View>

      <SectionHeading
        title="Claim history"
        subtitle="All automatic claim activity."
        style={styles.claimsHeading}
      />

      {claims.length === 0 ? (
        <AppCard variant="muted">
          <Text style={styles.emptyIcon}>📭</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No claims yet</Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Once a verified disruption triggers protection, the generated claim
            will show up here with payout and review status.
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
    <View style={[
      styles.statCard,
      {
        backgroundColor: accent ? colors.navy800 : colors.surface,
        borderColor: accent ? colors.borderNavy : colors.borderLight,
      },
    ]}>
      <Text style={[styles.statValue, { color: accent ? colors.emerald400 : colors.text }]}>
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
  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  statCard: {
    flex: 1, borderRadius: radii.md, padding: spacing.md,
    borderWidth: 1, ...shadows.sm,
  },
  statValue: { fontSize: 24, fontWeight: '700', marginBottom: 4 },
  statLabel: { fontSize: 13, fontWeight: '500' },
  claimsHeading: { marginTop: spacing.lg },
  emptyIcon: { fontSize: 32, textAlign: 'center', marginBottom: spacing.sm },
  emptyTitle: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: spacing.xs },
  emptyText: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
});
