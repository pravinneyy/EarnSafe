import React, { useEffect, useState } from 'react';
import {
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getUserClaims } from '../../../services/api';
import ClaimListItem from '../../claims/components/ClaimListItem';
import { DISRUPTION_OPTIONS } from '../../claims/constants';
import {
  AppButton,
  AppCard,
  AppPill,
  Screen,
  SectionHeading,
} from '../../../shared/components';
import { colors, spacing } from '../../../shared/theme';
import {
  formatCurrency,
  formatPercentFromScore,
  toTitleCase,
} from '../../../shared/utils/format';

export default function HomeScreen({ route, navigation }) {
  const { user, policy } = route.params;
  const [claims, setClaims] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  async function loadClaims() {
    try {
      const data = await getUserClaims(user.id);
      setClaims([...data].sort((left, right) => right.id - left.id));
    } catch (_error) {
      setClaims([]);
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

  const totalPaid = claims
    .filter(claim => claim.status === 'approved')
    .reduce((sum, claim) => sum + claim.claim_amount, 0);

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
        title={`Welcome back, ${user?.name ? user.name.split(' ')[0] : 'Guest'}!`}
        subtitle="Your coverage is active. Review your plan, monitor covered events, and check automatically triggered claims."
      />

      <AppCard style={styles.coverageCard}>
        <View style={styles.coverageHeader}>
          <View>
            <Text style={styles.coverageTitle}>
              {toTitleCase(policy.plan_tier)} Shield
            </Text>
            <Text style={styles.coverageSubtitle}>Current policy</Text>
          </View>
          <AppPill label="Active" tone="success" />
        </View>

        <View style={styles.statGrid}>
          <OverviewStat
            label="Daily coverage"
            value={formatCurrency(policy.daily_coverage)}
          />
          <OverviewStat
            label="Weekly premium"
            value={formatCurrency(policy.weekly_premium)}
          />
          <OverviewStat
            label="Max payout"
            value={formatCurrency(policy.max_weekly_payout)}
          />
          <OverviewStat
            label="Risk score"
            value={formatPercentFromScore(user.risk_score)}
          />
        </View>

        <View style={styles.metaBlock}>
          <Text style={styles.metaLine}>City: {user.city}</Text>
          <Text style={styles.metaLine}>Zone: {user.delivery_zone}</Text>
          <Text style={styles.metaLine}>Platform: {toTitleCase(user.platform)}</Text>
          <Text style={styles.metaLine}>
            Total paid out: {formatCurrency(totalPaid)}
          </Text>
        </View>
      </AppCard>

      <AppButton
        label="View claim history"
        variant="secondary"
        onPress={() => navigation.navigate('ClaimHistory', { user })}
        style={styles.secondaryAction}
      />

      <SectionHeading
        title="Covered events"
        subtitle="These are the disruption types the product is designed around."
      />
      <View style={styles.coveredEvents}>
        {DISRUPTION_OPTIONS.map(option => (
          <AppPill
            key={option.key}
            label={option.label}
            tone="neutral"
            style={styles.eventPill}
          />
        ))}
      </View>

      <SectionHeading
        title="Recent claims"
        subtitle="Latest automatically triggered claims for this worker."
      />

      {claims.length === 0 ? (
        <AppCard>
          <Text style={styles.emptyTitle}>No automated claims yet</Text>
          <Text style={styles.emptyText}>
            When a verified disruption affects this worker's insured zone, the
            generated claim will appear here with status and payout details.
          </Text>
        </AppCard>
      ) : (
        claims.slice(0, 3).map(claim => (
          <ClaimListItem key={claim.id} claim={claim} />
        ))
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
  coverageCard: {
    marginBottom: spacing.lg,
  },
  coverageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  coverageTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  coverageSubtitle: {
    color: colors.textSoft,
    fontSize: 14,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.sm,
  },
  statItem: {
    width: '50%',
    marginBottom: spacing.md,
  },
  statValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    color: colors.textSoft,
    fontSize: 13,
  },
  metaBlock: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  metaLine: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 22,
  },
  secondaryAction: {
    marginBottom: spacing.lg,
  },
  coveredEvents: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: spacing.lg,
  },
  eventPill: {
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  emptyText: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 22,
  },
});