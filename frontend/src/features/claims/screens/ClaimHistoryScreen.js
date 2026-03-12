import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getUserClaims } from '../../../services/api';
import ClaimListItem from '../components/ClaimListItem';
import { AppCard, Screen, SectionHeading } from '../../../shared/components';
import { colors, spacing } from '../../../shared/theme';
import {
  formatCurrency,
  formatPercentFromRatio,
} from '../../../shared/utils/format';

export default function ClaimHistoryScreen({ route }) {
  const { user } = route.params;
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadClaims() {
    try {
      const data = await getUserClaims(user.id);
      setClaims([...data].sort((left, right) => right.id - left.id));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClaims();
  }, [user.id]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadClaims();
    setRefreshing(false);
  }

  const approvedClaims = claims.filter(claim => claim.status === 'approved');
  const totalPaid = approvedClaims.reduce(
    (sum, claim) => sum + claim.claim_amount,
    0
  );
  const approvalRatio = claims.length === 0 ? 0 : approvedClaims.length / claims.length;

  if (loading) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

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
        title="Claim history"
        subtitle={`All automatically generated claims for ${user.name}.`}
      />

      <AppCard style={styles.summaryCard}>
        <View style={styles.summaryGrid}>
          <SummaryItem label="Claims" value={`${claims.length}`} />
          <SummaryItem label="Approved" value={`${approvedClaims.length}`} />
          <SummaryItem
            label="Approval rate"
            value={formatPercentFromRatio(approvalRatio)}
          />
          <SummaryItem label="Paid out" value={formatCurrency(totalPaid)} />
        </View>
      </AppCard>

      {claims.length === 0 ? (
        <AppCard>
          <Text style={styles.emptyTitle}>No claims yet</Text>
          <Text style={styles.emptyText}>
            Once a verified disruption triggers protection for this worker, the
            generated claim will appear here with amount, review outcome, and
            fraud score.
          </Text>
        </AppCard>
      ) : (
        claims.map(claim => <ClaimListItem key={claim.id} claim={claim} />)
      )}
    </Screen>
  );
}

function SummaryItem({ label, value }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    marginBottom: spacing.lg,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  summaryItem: {
    width: '50%',
    marginBottom: spacing.md,
  },
  summaryValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryLabel: {
    color: colors.textSoft,
    fontSize: 13,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  emptyText: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 22,
  },
});
