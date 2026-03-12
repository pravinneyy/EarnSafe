import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppCard, AppPill } from '../../../shared/components';
import { colors, spacing } from '../../../shared/theme';
import {
  getDisruptionLabel,
  getStatusTone,
} from '../constants';
import {
  formatCurrency,
  formatHours,
  formatPercent,
} from '../../../shared/utils/format';

export default function ClaimListItem({ claim }) {
  return (
    <AppCard style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headingBlock}>
          <Text style={styles.title}>{getDisruptionLabel(claim.disruption_type)}</Text>
          <Text style={styles.subtitle}>Claim #{claim.id}</Text>
        </View>
        <AppPill
          label={claim.status}
          tone={getStatusTone(claim.status)}
        />
      </View>

      <View style={styles.detailsRow}>
        <DetailItem label="Amount" value={formatCurrency(claim.claim_amount)} />
        <DetailItem label="Hours lost" value={formatHours(claim.hours_lost)} />
        <DetailItem
          label="Fraud score"
          value={formatPercent(claim.fraud_score)}
        />
      </View>

      {!!claim.reason && <Text style={styles.reason}>{claim.reason}</Text>}
    </AppCard>
  );
}

function DetailItem({ label, value }) {
  return (
    <View style={styles.detailItem}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  headingBlock: {
    flex: 1,
    paddingRight: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: 13,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    color: colors.textSoft,
    fontSize: 12,
    marginBottom: 4,
  },
  detailValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  reason: {
    marginTop: spacing.md,
    color: colors.textSoft,
    fontSize: 13,
    lineHeight: 20,
  },
});
